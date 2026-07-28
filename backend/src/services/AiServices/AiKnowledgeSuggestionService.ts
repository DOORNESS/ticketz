import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import AiKnowledgeSuggestion from "../../models/AiKnowledgeSuggestion";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import KnowledgeAsset from "../../models/KnowledgeAsset";
import KnowledgeAssetVersion from "../../models/KnowledgeAssetVersion";
import KnowledgeChunk from "../../models/KnowledgeChunk";
import StorageService from "../StorageService/StorageService";
import { Mutex } from "async-mutex";
import { Op } from "sequelize";
import { chatCompletion } from "./ModelGateway";
import { ingestKnowledgeDocument } from "./IngestKnowledgeDocumentService";
import { logger } from "../../utils/logger";
import {
  ensureAnnexResponsesKnowledgeBase,
  ensureAnnexCategoryId,
  resolveAnnexResponsesBrand
} from "./EnsureAnnexResponsesKnowledgeBase";
import {
  createKnowledgeAsset,
  promoteAndPublishKnowledgeAsset
} from "./KnowledgeCms/KnowledgeAssetCmsService";
import { isKbCmsEnabledForCompany } from "./KnowledgeCms/AiKbCmsFeatureFlag";
import {
  createAssetVersion,
  getNextVersionNumber
} from "./KnowledgeCms/KnowledgeAssetVersionService";
import { resolveKnowledgeStorageKey } from "../../helpers/mediaStorage";

const ANNEX_HISTORY_ASSET_SLUG = "historico-respostas-validadas";
const ANNEX_HISTORY_ASSET_TITLE = "Histórico de respostas validadas";
const annexHistoryMutex = new Mutex();

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

const mergeChunkContents = (chunks: KnowledgeChunk[]): string => {
  let merged = "";
  for (const chunk of chunks) {
    const content = String(chunk.content || "");
    if (!merged) {
      merged = content;
      continue;
    }

    let overlap = 0;
    const maxOverlap = Math.min(300, merged.length, content.length);
    for (let size = maxOverlap; size > 0; size -= 1) {
      if (merged.endsWith(content.slice(0, size))) {
        overlap = size;
        break;
      }
    }
    merged += content.slice(overlap);
  }
  return merged.trim();
};

const loadLegacyAnnexContent = async (
  companyId: number,
  targetBaseId: number
): Promise<string> => {
  const legacyBases = await KnowledgeBase.findAll({
    where: {
      companyId,
      slug: {
        [Op.in]: ["respostas-anexas-nivel", "respostas-anexas-fortmax"]
      }
    },
    attributes: ["id", "slug"]
  });

  const legacyBaseIds = legacyBases
    .map(base => base.id)
    .filter(id => id !== targetBaseId);
  if (!legacyBaseIds.length) {
    return "";
  }

  const assets = await KnowledgeAsset.findAll({
    where: { companyId, knowledgeBaseId: { [Op.in]: legacyBaseIds } },
    attributes: ["id", "title", "publishedVersionId", "currentVersionId"]
  });

  const sections: string[] = [];
  for (const asset of assets) {
    const versionId = asset.publishedVersionId || asset.currentVersionId;
    if (!versionId) continue;
    const chunks = await KnowledgeChunk.findAll({
      where: { companyId, knowledgeAssetVersionId: versionId },
      order: [["id", "ASC"]]
    });
    const content = mergeChunkContents(chunks);
    if (content) {
      sections.push(`## Conteúdo legado — ${asset.title}\n\n${content}`);
    }
  }
  return sections.join("\n\n---\n\n");
};

const loadCumulativeAssetText = async (
  companyId: number,
  asset: KnowledgeAsset
): Promise<string> => {
  const versionId = asset.currentVersionId || asset.publishedVersionId;
  if (!versionId) return "";

  const version = await KnowledgeAssetVersion.findOne({
    where: { id: versionId, companyId },
    attributes: ["storageUrl"]
  });
  if (version?.storageUrl) {
    try {
      const key = resolveKnowledgeStorageKey(version.storageUrl);
      const buffer = await StorageService.download(key, companyId);
      return buffer.toString("utf-8").trim();
    } catch (error) {
      logger.warn(
        { error, companyId, assetId: asset.id, versionId },
        "Failed to load cumulative annex file; rebuilding from chunks"
      );
    }
  }

  const chunks = await KnowledgeChunk.findAll({
    where: { companyId, knowledgeAssetVersionId: versionId },
    order: [["id", "ASC"]]
  });
  return mergeChunkContents(chunks);
};

const buildAnnexEntry = async ({
  ticketId,
  brand,
  title,
  content
}: {
  ticketId?: number;
  brand: string;
  title: string;
  content: string;
}): Promise<string> => {
  const transcript = ticketId ? await buildTranscript(ticketId) : "";
  const timestamp = new Date().toISOString();
  return [
    `## Ticket #${ticketId || "sem-ticket"} — ${title}`,
    "",
    `- Linha: ${brand === "nivel" ? "Nível" : brand === "fortmax" ? "Fortmax" : "Não identificada"}`,
    `- Registrado em: ${timestamp}`,
    "",
    "### Conversa",
    "",
    transcript || "Conversa não disponível.",
    "",
    "### Resposta validada pelo humano",
    "",
    content
  ].join("\n");
};

const appendHumanResponseToCumulativeAsset = async ({
  companyId,
  base,
  ticketId,
  brand,
  title,
  content,
  userId
}: {
  companyId: number;
  base: KnowledgeBase;
  ticketId?: number;
  brand: string;
  title: string;
  content: string;
  userId?: number;
}): Promise<KnowledgeAsset> =>
  annexHistoryMutex.runExclusive(async () => {
    let asset = await KnowledgeAsset.findOne({
      where: {
        companyId,
        knowledgeBaseId: base.id,
        slug: ANNEX_HISTORY_ASSET_SLUG
      }
    });

    const previousText = asset
      ? await loadCumulativeAssetText(companyId, asset)
      : await loadLegacyAnnexContent(companyId, base.id);
    const entry = await buildAnnexEntry({
      ticketId,
      brand,
      title,
      content
    });
    const cumulativeText = [previousText, entry]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const upload = await StorageService.uploadBuffer(
      Buffer.from(cumulativeText, "utf-8"),
      {
        companyId,
        assetId: asset?.id,
        filename: `historico-respostas-validadas-${Date.now()}.md`,
        contentType: "text/markdown",
        folder: "knowledge/validated-responses",
        uploadedByUserId: userId,
        retentionExempt: true
      }
    );

    if (!asset) {
      asset = await createKnowledgeAsset({
        companyId,
        knowledgeBaseId: base.id,
        categoryId: await ensureAnnexCategoryId(companyId, base.id),
        assetType: "markdown",
        title: ANNEX_HISTORY_ASSET_TITLE,
        slug: ANNEX_HISTORY_ASSET_SLUG,
        summary:
          "Documento cumulativo com conversas e respostas validadas por humanos.",
        authorUserId: userId,
        metadata: {
          source: "human_supervision",
          cumulative: true
        }
      });
      await KnowledgeAssetVersion.update(
        { storageUrl: upload.key },
        {
          where: {
            id: asset.currentVersionId,
            companyId,
            knowledgeAssetId: asset.id
          }
        }
      );
    } else {
      const version = await createAssetVersion({
        companyId,
        knowledgeAssetId: asset.id,
        versionNumber: await getNextVersionNumber(companyId, asset.id),
        title: ANNEX_HISTORY_ASSET_TITLE,
        storageUrl: upload.key,
        rawTextPreview: cumulativeText.slice(0, 500),
        changeSummary: `Resposta validada do ticket #${ticketId || "sem-ticket"}`,
        createdByUserId: userId
      });
      await asset.update({ currentVersionId: version.id });
    }

    await promoteAndPublishKnowledgeAsset(companyId, asset.id, userId);
    return asset.reload();
  });

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

export const annexHumanResponseToBase = async ({
  companyId,
  ticketId,
  title,
  content,
  userId
}: {
  companyId: number;
  ticketId?: number;
  title: string;
  content: string;
  userId?: number;
}): Promise<{ base: KnowledgeBase; assetId?: number; documentId?: number }> => {
  const brand = await resolveAnnexResponsesBrand(companyId, ticketId);
  const base = await ensureAnnexResponsesKnowledgeBase(companyId, "default");
  const normalizedTitle = title.trim() || "Resposta supervisionada";
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    throw new Error("ERR_ANNEX_CONTENT_REQUIRED");
  }

  const cmsEnabled = await isKbCmsEnabledForCompany(companyId);

  if (cmsEnabled) {
    const asset = await appendHumanResponseToCumulativeAsset({
      companyId,
      base,
      ticketId,
      brand,
      title: normalizedTitle,
      content: normalizedContent,
      userId
    });

    await AiKnowledgeSuggestion.create({
      companyId,
      ticketId: ticketId || null,
      suggestedTitle: normalizedTitle,
      suggestedContent: normalizedContent,
      status: "approved",
      knowledgeBaseId: base.id,
      actionType: "annex_response"
    });

    return { base, assetId: asset.id };
  }

  await StorageService.ensureReady(companyId);
  const upload = await StorageService.uploadBuffer(
    Buffer.from(normalizedContent, "utf-8"),
    {
      companyId,
      filename: `${normalizedTitle}.txt`,
      contentType: "text/plain",
      folder: "knowledge/text"
    }
  );

  const document = await KnowledgeDocument.create({
    companyId,
    knowledgeBaseId: base.id,
    title: normalizedTitle,
    type: "text",
    originalFilename: `${normalizedTitle}.txt`,
    storageUrl: upload.key,
    status: "pending"
  });

  await ingestKnowledgeDocument(document.id, companyId, normalizedContent);

  await AiKnowledgeSuggestion.create({
    companyId,
    ticketId: ticketId || null,
    suggestedTitle: normalizedTitle,
    suggestedContent: normalizedContent,
    status: "approved",
    knowledgeBaseId: base.id,
    documentId: document.id,
    actionType: "annex_response"
  });

  return { base, documentId: document.id };
};
