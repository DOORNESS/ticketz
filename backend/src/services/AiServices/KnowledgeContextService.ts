import { Op } from "sequelize";
import sequelize from "../../database";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import KnowledgeChunk from "../../models/KnowledgeChunk";
import KnowledgeBase from "../../models/KnowledgeBase";
import { createEmbedding } from "./ModelGateway";
import {
  postProcessRetrievedChunks,
  retrieveKnowledgeForQuery,
  searchKnowledgeChunksByText,
  RetrievedChunk
} from "./RetrievalEngine";
import { ingestKnowledgeDocument } from "./IngestKnowledgeDocumentService";
import { logger } from "../../utils/logger";
import { isInternalKnowledgeSection } from "./sanitizeAiOutboundText";
import {
  getRagMinimumSimilarity,
  RAG_CHUNK_SIZE,
  RAG_MAX_CONTEXT_CHARS,
  RAG_RETRIEVAL_LIMIT
} from "./RagConfig";

const MAX_CONTEXT_CHARS = RAG_MAX_CONTEXT_CHARS;
const MAX_CHUNK_SNIPPET = RAG_CHUNK_SIZE;
const FULL_CORPUS_DOC_LIMIT = 24;

/**
 * Até este tamanho, a base inteira vai para o contexto em vez de passar pela
 * busca vetorial. 32 trechos de 1800 caracteres cabem folgadamente no limite
 * de contexto e eliminam a classe inteira de "está na base mas o RAG não
 * achou".
 */
const AUTO_FULL_CORPUS_CHUNK_LIMIT = Number(
  process.env.AI_AUTO_FULL_CORPUS_CHUNK_LIMIT || 32
);
const MIN_BASE_DESCRIPTION_CHARS = 120;
const MAX_DESCRIPTION_SECTIONS = 16;

type ContextChunk = KnowledgeContextResult["usedChunks"][number];

export type KnowledgeContextResult = {
  contextBlock: string;
  usedChunks: {
    id: number;
    content: string;
    similarity: number;
    knowledgeDocumentId?: number;
    documentTitle?: string;
    page?: number;
    chapter?: string;
    section?: string;
  }[];
  hasReadyDocuments: boolean;
  reingestedDocuments: number;
};

/**
 * O piso de similaridade já foi aplicado em `postProcessRetrievedChunks`,
 * ANTES do rerank. Reaplicá-lo aqui, sobre o score que o rerank reduz em 25%,
 * elevava o piso real de 0.25 para 0.333 sem ninguém pedir — e trecho
 * relevante em português costuma ficar justamente nessa faixa. O piso do
 * rerank é proporcionalmente menor para preservar a intenção original.
 */
const RERANK_SCORE_FACTOR = 0.75;

const mapChunks = (chunks: RetrievedChunk[]) =>
  chunks
    .filter(
      chunk =>
        chunk.similarity >= getRagMinimumSimilarity() * RERANK_SCORE_FACTOR
    )
    .map(chunk => ({
      id: chunk.id,
      content: chunk.content.slice(0, MAX_CHUNK_SNIPPET),
      similarity: chunk.similarity,
      knowledgeDocumentId: chunk.knowledgeDocumentId,
      documentTitle: String(
        chunk.metadata?.documentTitle || chunk.metadata?.assetTitle || ""
      ),
      page: Number(chunk.metadata?.page) || undefined,
      chapter: String(chunk.metadata?.chapter || "") || undefined,
      section: String(chunk.metadata?.section || "") || undefined
    }));

const buildContextBlock = (chunks: ContextChunk[]): string =>
  chunks
    .map((chunk, idx) => {
      const source = [
        chunk.documentTitle,
        chunk.chapter,
        chunk.section,
        chunk.page ? `p. ${chunk.page}` : ""
      ].filter(Boolean);
      const label = source.length ? ` — ${source.join(" · ")}` : "";
      return `[Trecho ${idx + 1}${label}]\n${chunk.content}`;
    })
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);

const expandKnowledgeBaseIdsByDomain = async (
  companyId: number,
  knowledgeBaseIds: number[]
): Promise<number[]> => {
  if (!knowledgeBaseIds.length) {
    return knowledgeBaseIds;
  }

  const linkedBases = await KnowledgeBase.findAll({
    where: { companyId, id: { [Op.in]: knowledgeBaseIds } },
    attributes: ["id", "knowledgeDomainId"]
  });

  const domainIds = [
    ...new Set(
      linkedBases
        .map(base => base.knowledgeDomainId)
        .filter((id): id is number => Boolean(id))
    )
  ];

  if (!domainIds.length) {
    return knowledgeBaseIds;
  }

  const siblingBases = await KnowledgeBase.findAll({
    where: {
      companyId,
      active: true,
      knowledgeDomainId: { [Op.in]: domainIds }
    },
    attributes: ["id"],
    order: [["id", "ASC"]]
  });

  return [
    ...new Set([...knowledgeBaseIds, ...siblingBases.map(base => base.id)])
  ];
};

const splitDescriptionSections = (text: string): string[] => {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const byHeading = normalized
    .split(/\n(?=#{1,3}\s)|\n---+\n/)
    .map(part => part.trim())
    .filter(part => part.length >= 40);

  if (byHeading.length > 1) {
    return byHeading;
  }

  const byParagraph = normalized
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(part => part.length >= 40);

  if (byParagraph.length > 1) {
    return byParagraph;
  }

  if (normalized.length <= MAX_CHUNK_SNIPPET) {
    return [normalized];
  }

  const slices: string[] = [];
  for (
    let offset = 0;
    offset < normalized.length;
    offset += MAX_CHUNK_SNIPPET
  ) {
    slices.push(normalized.slice(offset, offset + MAX_CHUNK_SNIPPET).trim());
  }
  return slices.filter(Boolean);
};

/**
 * Pontuação de seção por sobreposição de termos.
 *
 * O bônus fixo para "cashback"/"nível" foi removido: uma marca era favorecida
 * no ranking de todas as outras, e o vocabulário de uma marca nova nunca
 * receberia o mesmo peso. O reforço agora vem do vocabulário da própria marca
 * do atendimento (`brandVocabulary`), então cada operação pontua com os seus
 * termos e nenhuma tem vantagem embutida no código.
 */
const scoreSectionForQuery = (
  section: string,
  query: string,
  brandVocabulary: string[] = []
): number => {
  const normalizedQuery = query.toLowerCase();
  const normalizedSection = section.toLowerCase();
  let score = 0;

  normalizedQuery
    .split(/\s+/)
    .filter(token => token.length >= 3)
    .forEach(token => {
      if (normalizedSection.includes(token)) {
        score += 1;
      }
    });

  const vocabularyHit = brandVocabulary
    .map(term => term.toLowerCase())
    .filter(term => term.length >= 3)
    .some(
      term => normalizedQuery.includes(term) && normalizedSection.includes(term)
    );

  if (vocabularyHit) {
    score += 3;
  }

  return score;
};

export const loadKnowledgeBaseDescriptionChunks = async (
  companyId: number,
  knowledgeBaseIds: number[],
  userText = "",
  limit = MAX_DESCRIPTION_SECTIONS,
  brandVocabulary: string[] = []
): Promise<ContextChunk[]> => {
  if (!knowledgeBaseIds.length) {
    return [];
  }

  const bases = await KnowledgeBase.findAll({
    where: {
      companyId,
      id: { [Op.in]: knowledgeBaseIds },
      active: true
    },
    attributes: ["id", "name", "description"],
    order: [["id", "ASC"]]
  });

  const sections: ContextChunk[] = [];

  bases.forEach(base => {
    const description = (base.description || "").trim();
    if (description.length < MIN_BASE_DESCRIPTION_CHARS) {
      return;
    }

    splitDescriptionSections(description).forEach((part, index) => {
      if (isInternalKnowledgeSection(part)) {
        return;
      }

      sections.push({
        id: base.id * 10000 + index,
        content: part.slice(0, MAX_CHUNK_SNIPPET),
        similarity: userText
          ? scoreSectionForQuery(part, userText, brandVocabulary)
          : 0.35,
        documentTitle: base.name
      });
    });
  });

  if (userText.trim()) {
    const ranked = sections
      .filter(section => section.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity);

    if (ranked.length) {
      return ranked.slice(0, limit).map(section => ({
        ...section,
        similarity: Math.max(section.similarity, 0.35)
      }));
    }
  }

  return sections.slice(0, limit);
};

const mergeContextChunks = (
  primary: ContextChunk[],
  secondary: ContextChunk[],
  limit = 48
): ContextChunk[] => {
  const seen = new Set<string>();
  const merged: ContextChunk[] = [];

  [...primary, ...secondary].forEach(chunk => {
    const key = chunk.content.slice(0, 180);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(chunk);
  });

  return merged.slice(0, limit);
};

const countBasesWithDescription = async (
  companyId: number,
  knowledgeBaseIds: number[]
): Promise<number> => {
  const bases = await KnowledgeBase.findAll({
    where: {
      companyId,
      id: { [Op.in]: knowledgeBaseIds },
      active: true
    },
    attributes: ["description"]
  });

  return bases.filter(
    base => (base.description || "").trim().length >= MIN_BASE_DESCRIPTION_CHARS
  ).length;
};

const loadPublishedCmsChunkTexts = async (
  companyId: number,
  knowledgeBaseIds: number[],
  chunkLimit = FULL_CORPUS_DOC_LIMIT
): Promise<ContextChunk[]> => {
  const [cmsRows] = await sequelize.query(
    `
    SELECT
      kc.id,
      kc.content,
      ka.title AS "documentTitle",
      kc."knowledgeDocumentId"
    FROM "KnowledgeChunks" kc
    INNER JOIN "KnowledgeAssets" ka ON ka.id = kc."knowledgeAssetId"
    INNER JOIN "KnowledgeAssetVersions" kav ON kav.id = kc."knowledgeAssetVersionId"
    WHERE kc."companyId" = :companyId
      AND kc."knowledgeBaseId" IN (:knowledgeBaseIds)
      AND kc."lifecycleStatus" = 'published'
      AND ka."lifecycleStatus" = 'published'
      AND ka."publishedVersionId" = kc."knowledgeAssetVersionId"
      AND kav."ingestionStatus" = 'indexed'
    ORDER BY kc.id ASC
    LIMIT :chunkLimit
    `,
    {
      replacements: { companyId, knowledgeBaseIds, chunkLimit }
    }
  );

  return (
    cmsRows as {
      id: number;
      content: string;
      documentTitle?: string;
      knowledgeDocumentId?: number;
    }[]
  ).map(row => ({
    id: row.id,
    content: String(row.content || "").slice(0, MAX_CHUNK_SNIPPET),
    similarity: 0.4,
    knowledgeDocumentId: row.knowledgeDocumentId,
    documentTitle: row.documentTitle || ""
  }));
};

const countPublishedCmsChunks = async (
  companyId: number,
  knowledgeBaseIds: number[]
): Promise<number> => {
  const [cmsCountRows] = await sequelize.query(
    `
    SELECT COUNT(*)::int AS count
    FROM "KnowledgeChunks" kc
    INNER JOIN "KnowledgeAssets" ka ON ka.id = kc."knowledgeAssetId"
    INNER JOIN "KnowledgeAssetVersions" kav ON kav.id = kc."knowledgeAssetVersionId"
    WHERE kc."companyId" = :companyId
      AND kc."knowledgeBaseId" IN (:knowledgeBaseIds)
      AND kc."lifecycleStatus" = 'published'
      AND ka."lifecycleStatus" = 'published'
      AND ka."publishedVersionId" = kc."knowledgeAssetVersionId"
      AND kav."ingestionStatus" = 'indexed'
    `,
    { replacements: { companyId, knowledgeBaseIds } }
  );

  return (cmsCountRows as { count: number }[])[0]?.count || 0;
};

const loadLegacyDocumentChunkTexts = async (
  companyId: number,
  knowledgeBaseIds: number[],
  chunkLimit = FULL_CORPUS_DOC_LIMIT
): Promise<ContextChunk[]> => {
  const rows = await KnowledgeChunk.findAll({
    where: { companyId },
    include: [
      {
        model: KnowledgeDocument,
        required: true,
        where: {
          companyId,
          knowledgeBaseId: { [Op.in]: knowledgeBaseIds },
          status: "ready"
        },
        attributes: ["id", "title"]
      }
    ],
    order: [["id", "ASC"]],
    limit: chunkLimit
  });

  return rows.map(row => ({
    id: row.id,
    content: row.content.slice(0, MAX_CHUNK_SNIPPET),
    similarity: 0.4,
    knowledgeDocumentId: row.knowledgeDocumentId,
    documentTitle:
      (row as KnowledgeChunk & { KnowledgeDocument?: KnowledgeDocument })
        .KnowledgeDocument?.title || ""
  }));
};

const loadAllReadyChunkTexts = async (
  companyId: number,
  knowledgeBaseIds: number[],
  chunkLimit = FULL_CORPUS_DOC_LIMIT
): Promise<ContextChunk[]> =>
  mergeContextChunks(
    await loadPublishedCmsChunkTexts(companyId, knowledgeBaseIds, chunkLimit),
    await loadLegacyDocumentChunkTexts(companyId, knowledgeBaseIds, chunkLimit),
    chunkLimit
  );

const reingestPendingDocuments = async (
  companyId: number,
  knowledgeBaseIds: number[]
): Promise<number> => {
  const pendingDocs = await KnowledgeDocument.findAll({
    where: {
      companyId,
      knowledgeBaseId: { [Op.in]: knowledgeBaseIds },
      status: { [Op.in]: ["pending", "error", "processing"] }
    },
    limit: 5,
    order: [["updatedAt", "ASC"]]
  });

  let ingested = 0;

  // eslint-disable-next-line no-restricted-syntax
  for (const document of pendingDocs) {
    try {
      await ingestKnowledgeDocument(document.id, companyId);
      ingested += 1;
    } catch (error) {
      logger.warn(
        { error, documentId: document.id, companyId },
        "Failed to re-ingest knowledge document before AI reply"
      );
    }
  }

  return ingested;
};

export const buildKnowledgeContextForQuery = async ({
  companyId,
  knowledgeBaseIds,
  userText,
  provider,
  loadStrategy = "auto",
  brandVocabulary = [],
  skipReingest = false
}: {
  companyId: number;
  knowledgeBaseIds: number[];
  userText: string;
  provider?: string;
  loadStrategy?: "auto" | "full";
  /** Vocabulário da marca do atendimento — reforça o ranking de seções. */
  brandVocabulary?: string[];
  skipReingest?: boolean;
}): Promise<KnowledgeContextResult> => {
  const expandedKnowledgeBaseIds = await expandKnowledgeBaseIdsByDomain(
    companyId,
    knowledgeBaseIds
  );

  if (!expandedKnowledgeBaseIds.length) {
    return {
      contextBlock: "",
      usedChunks: [],
      hasReadyDocuments: false,
      reingestedDocuments: 0
    };
  }

  const readyCount = await KnowledgeDocument.count({
    where: {
      companyId,
      knowledgeBaseId: { [Op.in]: expandedKnowledgeBaseIds },
      status: "ready"
    }
  });

  const cmsPublishedChunkCount = await countPublishedCmsChunks(
    companyId,
    expandedKnowledgeBaseIds
  );

  const descriptionReadyCount = await countBasesWithDescription(
    companyId,
    expandedKnowledgeBaseIds
  );

  let reingestedDocuments = 0;

  if (!skipReingest && readyCount + cmsPublishedChunkCount === 0) {
    reingestedDocuments = await reingestPendingDocuments(
      companyId,
      expandedKnowledgeBaseIds
    );
  }

  const descriptionLimit =
    loadStrategy === "full" ? MAX_DESCRIPTION_SECTIONS : 8;

  // Base pequena não precisa de busca: cabe inteira no contexto.
  //
  // O caminho de corpus completo existia e foi estreitado para `loadStrategy
  // === "full"`, que nenhum chamador de runtime usa — virou código morto. Em
  // produção as bases da Nível somam 22 trechos e a da Fortmax, 10; recuperar
  // 8 por similaridade num universo de 22 descarta contexto útil de graça e
  // faz o assistente dizer que não encontrou o que está bem ali.
  const totalReadyChunks = readyCount + cmsPublishedChunkCount;
  const fitsInFullCorpus =
    loadStrategy === "auto" &&
    totalReadyChunks > 0 &&
    totalReadyChunks <= AUTO_FULL_CORPUS_CHUNK_LIMIT;

  if (loadStrategy === "full" || fitsInFullCorpus) {
    const fullCorpusLimit =
      loadStrategy === "full" ? 48 : AUTO_FULL_CORPUS_CHUNK_LIMIT;
    const documentChunks = await loadAllReadyChunkTexts(
      companyId,
      expandedKnowledgeBaseIds,
      fullCorpusLimit
    );
    const descriptionChunks = await loadKnowledgeBaseDescriptionChunks(
      companyId,
      expandedKnowledgeBaseIds,
      userText,
      descriptionLimit,
      brandVocabulary
    );
    const usedChunks = mergeContextChunks(
      documentChunks,
      descriptionChunks,
      fullCorpusLimit
    );

    return {
      contextBlock: buildContextBlock(usedChunks),
      usedChunks,
      hasReadyDocuments: usedChunks.length > 0,
      reingestedDocuments
    };
  }

  let merged: RetrievedChunk[] = [];

  try {
    const queryEmbedding = await createEmbedding(companyId, userText, provider);
    merged = await retrieveKnowledgeForQuery(
      companyId,
      expandedKnowledgeBaseIds,
      userText,
      queryEmbedding,
      RAG_RETRIEVAL_LIMIT
    );
  } catch (error) {
    logger.warn(
      { error, companyId },
      "Vector knowledge search failed, falling back to keyword search"
    );
    const textChunks = await searchKnowledgeChunksByText(
      companyId,
      expandedKnowledgeBaseIds,
      userText,
      RAG_RETRIEVAL_LIMIT
    );
    merged = await postProcessRetrievedChunks({
      companyId,
      knowledgeBaseIds: expandedKnowledgeBaseIds,
      query: userText,
      chunks: textChunks,
      limit: RAG_RETRIEVAL_LIMIT
    });
  }

  let usedChunks: KnowledgeContextResult["usedChunks"] = mapChunks(merged);

  // Antes esta rede só pegava base VAZIA. Mas o caso que chega ao cliente é o
  // contrário: base cheia e recuperação sem nada acima do limiar. Aí a
  // descrição da base é melhor do que responder "não encontrei".
  if (!usedChunks.length && descriptionReadyCount > 0) {
    const descriptionChunks = await loadKnowledgeBaseDescriptionChunks(
      companyId,
      expandedKnowledgeBaseIds,
      userText,
      descriptionLimit,
      brandVocabulary
    );
    usedChunks = mergeContextChunks(usedChunks, descriptionChunks, 48);
  }

  const hasReadyDocuments =
    readyCount > 0 ||
    cmsPublishedChunkCount > 0 ||
    reingestedDocuments > 0 ||
    usedChunks.length > 0 ||
    (await countBasesWithDescription(companyId, expandedKnowledgeBaseIds)) > 0;

  return {
    contextBlock: buildContextBlock(usedChunks),
    usedChunks,
    hasReadyDocuments,
    reingestedDocuments
  };
};
