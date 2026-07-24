import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import AiKnowledgeSuggestion from "../../models/AiKnowledgeSuggestion";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import StorageService from "../StorageService/StorageService";
import { chatCompletion } from "./ModelGateway";
import { ingestKnowledgeDocument } from "./IngestKnowledgeDocumentService";
import { buildKnowledgeContextForQuery } from "./KnowledgeContextService";
import { getActiveAgentForTicket, getKnowledgeBaseIdsForAgent } from "./AiHelpers";
import { Op } from "sequelize";

export type LearningActionType =
  | "create_new"
  | "update_existing"
  | "review_later"
  | "declined";

export type LearningDraft = {
  title: string;
  mainQuestion: string;
  organizedAnswer: string;
  keywords: string[];
  category: string;
  summary: string;
  confidence: number;
  conversationSummary: string;
  transcript: string;
};

export type SimilarDocument = {
  documentId: number;
  title: string;
  confidence: number;
  similarSnippets: string[];
};

const DRAFT_PROMPT = `Analise o atendimento encerrado e gere um documento para a base de conhecimento.
Responda APENAS JSON válido:
{
  "title": "título curto",
  "mainQuestion": "pergunta principal do cliente",
  "organizedAnswer": "resposta organizada em markdown",
  "keywords": ["palavra1", "palavra2"],
  "category": "categoria sugerida",
  "summary": "resumo de uma linha",
  "confidence": 0.85,
  "conversationSummary": "resumo do atendimento"
}`;

const UPDATE_PROMPT = `Com base no atendimento e no documento existente, sugira APENAS o trecho novo a adicionar.
Responda APENAS JSON:
{
  "suggestedUpdate": "trecho em markdown",
  "confidence": 0.8
}`;

const buildTranscript = async (ticketId: number): Promise<string> => {
  const messages = await Message.findAll({
    where: { ticketId },
    order: [["createdAt", "ASC"]],
    limit: 50
  });

  return messages
    .map(msg => `${msg.fromMe ? "Atendente" : "Cliente"}: ${msg.body}`)
    .join("\n");
};

const parseJson = <T>(raw: string): T | null => {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
};

const enrichTicketContext = async (ticket: Ticket) => {
  const [contact, queue] = await Promise.all([
    ticket.contact || Contact.findByPk(ticket.contactId),
    ticket.queueId ? Queue.findByPk(ticket.queueId) : null
  ]);

  return {
    customerName: contact?.name || "Cliente",
    queueName: queue?.name || ""
  };
};

export const generateLearningDraft = async ({
  ticket,
  actionType,
  agentUserId
}: {
  ticket: Ticket;
  actionType: LearningActionType;
  agentUserId?: number;
}): Promise<AiKnowledgeSuggestion> => {
  const transcript = await buildTranscript(ticket.id);
  const context = await enrichTicketContext(ticket);

  const completion = await chatCompletion(ticket.companyId, {
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 1800,
    messages: [
      { role: "system", content: DRAFT_PROMPT },
      { role: "user", content: transcript }
    ]
  });

  const parsed = parseJson<LearningDraft>(completion.content || "");
  if (!parsed) {
    throw new Error("ERR_LEARNING_DRAFT_PARSE_FAILED");
  }

  const status = actionType === "review_later" ? "pending" : "pending";

  const existing = await AiKnowledgeSuggestion.findOne({
    where: {
      ticketId: ticket.id,
      companyId: ticket.companyId,
      status: { [Op.in]: ["pending", "draft"] }
    }
  });

  const payload = {
    actionType,
    suggestedTitle: parsed.title,
    suggestedContent: parsed.organizedAnswer,
    mainQuestion: parsed.mainQuestion,
    organizedAnswer: parsed.organizedAnswer,
    keywords: parsed.keywords,
    category: parsed.category,
    summary: parsed.summary,
    confidence: parsed.confidence,
    conversationSummary: parsed.conversationSummary,
    transcript,
    customerName: context.customerName,
    queueName: context.queueName,
    agentUserId,
    status
  };

  if (existing) {
    await existing.update(payload);
    return existing.reload();
  }

  return AiKnowledgeSuggestion.create({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    ...payload
  });
};

export const findSimilarDocumentsForLearning = async ({
  ticket,
  query
}: {
  ticket: Ticket;
  query?: string;
}): Promise<SimilarDocument[]> => {
  const agent = await getActiveAgentForTicket(ticket);
  if (!agent) {
    return [];
  }

  const knowledgeBaseIds = await getKnowledgeBaseIdsForAgent(
    ticket.companyId,
    agent.id,
    ticket.queueId
  );

  const searchText =
    query ||
    (
      await AiKnowledgeSuggestion.findOne({
        where: { ticketId: ticket.id, companyId: ticket.companyId },
        order: [["createdAt", "DESC"]]
      })
    )?.mainQuestion ||
    (await buildTranscript(ticket.id)).slice(0, 500);

  const knowledgeContext = await buildKnowledgeContextForQuery({
    companyId: ticket.companyId,
    knowledgeBaseIds,
    userText: searchText,
    provider: agent.provider
  });

  const documentIds = [
    ...new Set(
      knowledgeContext.usedChunks
        .map(chunk => chunk.knowledgeDocumentId)
        .filter(Boolean)
    )
  ];

  const documents = documentIds.length
    ? await KnowledgeDocument.findAll({
        where: {
          id: { [Op.in]: documentIds },
          companyId: ticket.companyId
        }
      })
    : [];

  const docMap = new Map(documents.map(doc => [doc.id, doc.title]));

  const grouped = new Map<number, SimilarDocument>();

  knowledgeContext.usedChunks.forEach(chunk => {
    const docId = chunk.knowledgeDocumentId;
    if (!docId) return;

    const current = grouped.get(docId) || {
      documentId: docId,
      title: docMap.get(docId) || `Documento #${docId}`,
      confidence: chunk.similarity,
      similarSnippets: []
    };

    current.confidence = Math.max(current.confidence, chunk.similarity);
    current.similarSnippets.push(chunk.content.slice(0, 280));
    grouped.set(docId, current);
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
};

export const generateUpdateSuggestion = async ({
  ticket,
  documentId,
  agentUserId
}: {
  ticket: Ticket;
  documentId: number;
  agentUserId?: number;
}): Promise<AiKnowledgeSuggestion> => {
  const document = await KnowledgeDocument.findOne({
    where: { id: documentId, companyId: ticket.companyId }
  });

  if (!document) {
    throw new Error("ERR_KNOWLEDGE_DOCUMENT_NOT_FOUND");
  }

  const transcript = await buildTranscript(ticket.id);
  const context = await enrichTicketContext(ticket);

  const completion = await chatCompletion(ticket.companyId, {
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 1200,
    messages: [
      { role: "system", content: UPDATE_PROMPT },
      {
        role: "user",
        content: [
          `Documento existente: ${document.title}`,
          `Atendimento:\n${transcript}`
        ].join("\n\n")
      }
    ]
  });

  const parsed = parseJson<{ suggestedUpdate: string; confidence: number }>(
    completion.content || ""
  );

  if (!parsed?.suggestedUpdate) {
    throw new Error("ERR_LEARNING_UPDATE_PARSE_FAILED");
  }

  const similarDocuments = await findSimilarDocumentsForLearning({ ticket });

  const payload = {
    actionType: "update_existing" as LearningActionType,
    selectedDocumentId: documentId,
    suggestedUpdate: parsed.suggestedUpdate,
    suggestedTitle: document.title,
    suggestedContent: parsed.suggestedUpdate,
    confidence: parsed.confidence,
    similarDocuments,
    transcript,
    customerName: context.customerName,
    queueName: context.queueName,
    agentUserId,
    status: "pending"
  };

  const existing = await AiKnowledgeSuggestion.findOne({
    where: {
      ticketId: ticket.id,
      companyId: ticket.companyId,
      status: { [Op.in]: ["pending", "draft"] }
    }
  });

  if (existing) {
    await existing.update(payload);
    return existing.reload();
  }

  return AiKnowledgeSuggestion.create({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    ...payload
  });
};

export const saveLearningDraft = async ({
  suggestionId,
  companyId,
  data
}: {
  suggestionId: number;
  companyId: number;
  data: Partial<LearningDraft> & {
    selectedDocumentId?: number;
    suggestedUpdate?: string;
    actionType?: LearningActionType;
  };
}): Promise<AiKnowledgeSuggestion> => {
  const suggestion = await AiKnowledgeSuggestion.findOne({
    where: { id: suggestionId, companyId }
  });

  if (!suggestion) {
    throw new Error("ERR_LEARNING_NOT_FOUND");
  }

  await suggestion.update({
    suggestedTitle: data.title || suggestion.suggestedTitle,
    mainQuestion: data.mainQuestion || suggestion.mainQuestion,
    organizedAnswer: data.organizedAnswer || suggestion.organizedAnswer,
    suggestedContent: data.organizedAnswer || suggestion.suggestedContent,
    keywords: data.keywords || suggestion.keywords,
    category: data.category || suggestion.category,
    summary: data.summary || suggestion.summary,
    selectedDocumentId:
      data.selectedDocumentId || suggestion.selectedDocumentId,
    suggestedUpdate: data.suggestedUpdate || suggestion.suggestedUpdate,
    actionType: data.actionType || suggestion.actionType,
    status: "pending"
  });

  return suggestion.reload();
};

export const recordLearningDeclined = async ({
  ticket,
  agentUserId
}: {
  ticket: Ticket;
  agentUserId?: number;
}): Promise<void> => {
  await AiKnowledgeSuggestion.create({
    companyId: ticket.companyId,
    ticketId: ticket.id,
    actionType: "declined",
    status: "rejected",
    agentUserId,
    rejectionReason: "Atendente indicou que não gerou conhecimento útil"
  });
};

export const listLearnings = async ({
  companyId,
  status,
  limit = 50,
  offset = 0
}: {
  companyId: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AiKnowledgeSuggestion[]; count: number }> => {
  const where: Record<string, unknown> = {
    companyId,
    actionType: { [Op.ne]: "declined" }
  };

  if (status) {
    where.status = status;
  }

  const { rows, count } = await AiKnowledgeSuggestion.findAndCountAll({
    where,
    include: [
      { model: Ticket, as: "ticket", attributes: ["id", "uuid", "status"] }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count };
};

export const approveLearning = async ({
  learningId,
  companyId,
  userId
}: {
  learningId: number;
  companyId: number;
  userId: number;
}): Promise<AiKnowledgeSuggestion> => {
  const learning = await AiKnowledgeSuggestion.findOne({
    where: { id: learningId, companyId }
  });

  if (!learning) {
    throw new Error("ERR_LEARNING_NOT_FOUND");
  }

  await learning.update({
    status: "approved",
    approvedByUserId: userId,
    approvedAt: new Date()
  });

  return learning.reload();
};

export const rejectLearning = async ({
  learningId,
  companyId,
  userId,
  reason
}: {
  learningId: number;
  companyId: number;
  userId: number;
  reason?: string;
}): Promise<AiKnowledgeSuggestion> => {
  const learning = await AiKnowledgeSuggestion.findOne({
    where: { id: learningId, companyId }
  });

  if (!learning) {
    throw new Error("ERR_LEARNING_NOT_FOUND");
  }

  await learning.update({
    status: "rejected",
    approvedByUserId: userId,
    rejectedAt: new Date(),
    rejectionReason: reason || "Rejeitado pelo administrador"
  });

  return learning.reload();
};

export const incorporateLearning = async ({
  learningId,
  companyId,
  userId,
  knowledgeBaseId
}: {
  learningId: number;
  companyId: number;
  userId: number;
  knowledgeBaseId: number;
}): Promise<AiKnowledgeSuggestion> => {
  const learning = await AiKnowledgeSuggestion.findOne({
    where: { id: learningId, companyId }
  });

  if (!learning) {
    throw new Error("ERR_LEARNING_NOT_FOUND");
  }

  const base = await KnowledgeBase.findOne({
    where: { id: knowledgeBaseId, companyId }
  });

  if (!base) {
    throw new Error("ERR_KNOWLEDGE_BASE_NOT_FOUND");
  }

  await StorageService.ensureReady(companyId);

  if (
    learning.actionType === "update_existing" &&
    learning.selectedDocumentId
  ) {
    const document = await KnowledgeDocument.findOne({
      where: { id: learning.selectedDocumentId, companyId }
    });

    if (!document) {
      throw new Error("ERR_KNOWLEDGE_DOCUMENT_NOT_FOUND");
    }

    const updatedContent = [
      learning.organizedAnswer || learning.suggestedContent,
      learning.suggestedUpdate
    ]
      .filter(Boolean)
      .join("\n\n");

    await ingestKnowledgeDocument(document.id, companyId, updatedContent);

    await learning.update({
      status: "incorporated",
      knowledgeBaseId,
      documentId: document.id,
      approvedByUserId: userId,
      approvedAt: new Date()
    });

    return learning.reload();
  }

  const content = [
    `# ${learning.suggestedTitle}`,
    learning.mainQuestion ? `## Pergunta\n${learning.mainQuestion}` : "",
    learning.organizedAnswer || learning.suggestedContent,
    Array.isArray(learning.keywords) && learning.keywords.length
      ? `## Palavras-chave\n${(learning.keywords as string[]).join(", ")}`
      : "",
    learning.category ? `## Categoria\n${learning.category}` : "",
    learning.summary ? `## Resumo\n${learning.summary}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const upload = await StorageService.uploadBuffer(
    Buffer.from(content, "utf-8"),
    {
      companyId,
      filename: `${learning.suggestedTitle || "aprendizado"}.txt`,
      contentType: "text/plain",
      folder: "knowledge/text"
    }
  );

  const document = await KnowledgeDocument.create({
    companyId,
    knowledgeBaseId,
    title: learning.suggestedTitle || "Aprendizado",
    type: "text",
    originalFilename: `${learning.suggestedTitle || "aprendizado"}.txt`,
    storageUrl: upload.key,
    status: "pending"
  });

  await ingestKnowledgeDocument(document.id, companyId, content);

  await learning.update({
    status: "incorporated",
    knowledgeBaseId,
    documentId: document.id,
    approvedByUserId: userId,
    approvedAt: new Date()
  });

  return learning.reload();
};

export const getLearningForTicket = async (
  ticketId: number,
  companyId: number
): Promise<AiKnowledgeSuggestion | null> =>
  AiKnowledgeSuggestion.findOne({
    where: {
      ticketId,
      companyId,
      status: { [Op.in]: ["pending", "draft"] }
    },
    order: [["createdAt", "DESC"]]
  });
