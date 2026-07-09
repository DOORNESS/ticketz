import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import AiKnowledgeSuggestion from "../../models/AiKnowledgeSuggestion";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import StorageService from "../StorageService/StorageService";
import { chatCompletion } from "./ModelGateway";
import { ingestKnowledgeDocument } from "./IngestKnowledgeDocumentService";
import { logger } from "../../utils/logger";

const SUGGESTION_PROMPT = `Analise o atendimento encerrado e proponha um documento para a base de conhecimento.
Responda APENAS JSON:
{
  "title": "título curto",
  "content": "conteúdo em markdown com a solução"
}`;

const buildTranscript = async (ticketId: number): Promise<string> => {
  const messages = await Message.findAll({
    where: { ticketId },
    order: [["createdAt", "ASC"]],
    limit: 40
  });

  return messages
    .map(msg => `${msg.fromMe ? "Atendente" : "Cliente"}: ${msg.body}`)
    .join("\n");
};

const parseSuggestionJson = (
  raw: string
): { title: string; content: string } | null => {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed?.title || !parsed?.content) {
      return null;
    }

    return {
      title: String(parsed.title),
      content: String(parsed.content)
    };
  } catch {
    return null;
  }
};

export const generateKnowledgeSuggestion = async (
  ticket: Ticket
): Promise<AiKnowledgeSuggestion | null> => {
  try {
    const transcript = await buildTranscript(ticket.id);
    const completion = await chatCompletion(ticket.companyId, {
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 1200,
      messages: [
        { role: "system", content: SUGGESTION_PROMPT },
        { role: "user", content: transcript }
      ]
    });

    const parsed = parseSuggestionJson(completion.content || "");
    if (!parsed) {
      return null;
    }

    const existing = await AiKnowledgeSuggestion.findOne({
      where: {
        ticketId: ticket.id,
        companyId: ticket.companyId,
        status: "pending"
      }
    });

    if (existing) {
      await existing.update({
        suggestedTitle: parsed.title,
        suggestedContent: parsed.content
      });
      return existing;
    }

    return AiKnowledgeSuggestion.create({
      companyId: ticket.companyId,
      ticketId: ticket.id,
      suggestedTitle: parsed.title,
      suggestedContent: parsed.content,
      status: "pending"
    });
  } catch (error) {
    logger.warn(
      { error, ticketId: ticket.id },
      "generateKnowledgeSuggestion failed"
    );
    return null;
  }
};

export const approveKnowledgeSuggestion = async ({
  suggestionId,
  companyId,
  knowledgeBaseId
}: {
  suggestionId: number;
  companyId: number;
  knowledgeBaseId: number;
}): Promise<AiKnowledgeSuggestion> => {
  const suggestion = await AiKnowledgeSuggestion.findOne({
    where: { id: suggestionId, companyId }
  });

  if (!suggestion) {
    throw new Error("ERR_KNOWLEDGE_SUGGESTION_NOT_FOUND");
  }

  const base = await KnowledgeBase.findOne({
    where: { id: knowledgeBaseId, companyId }
  });

  if (!base) {
    throw new Error("ERR_KNOWLEDGE_BASE_NOT_FOUND");
  }

  await StorageService.ensureReady(companyId);

  const upload = await StorageService.uploadBuffer(
    Buffer.from(suggestion.suggestedContent, "utf-8"),
    {
      companyId,
      filename: `${suggestion.suggestedTitle}.txt`,
      contentType: "text/plain",
      folder: "knowledge/text"
    }
  );

  const document = await KnowledgeDocument.create({
    companyId,
    knowledgeBaseId,
    title: suggestion.suggestedTitle,
    type: "text",
    originalFilename: `${suggestion.suggestedTitle}.txt`,
    storageUrl: upload.key,
    status: "pending"
  });

  await ingestKnowledgeDocument(
    document.id,
    companyId,
    suggestion.suggestedContent
  );

  await suggestion.update({
    status: "approved",
    knowledgeBaseId,
    documentId: document.id
  });

  return suggestion.reload();
};

export const getKnowledgeSuggestionForTicket = async (
  ticketId: number,
  companyId: number
): Promise<AiKnowledgeSuggestion | null> =>
  AiKnowledgeSuggestion.findOne({
    where: { ticketId, companyId, status: "pending" },
    order: [["createdAt", "DESC"]]
  });
