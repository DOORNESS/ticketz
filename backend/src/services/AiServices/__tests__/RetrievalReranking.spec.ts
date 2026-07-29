jest.mock("../../../database", () => ({
  __esModule: true,
  default: { query: jest.fn() }
}));

import sequelize from "../../../database";
import {
  expandRetrievedChunkNeighbors,
  rerankRetrievedChunks
} from "../RetrievalEngine";

describe("RAG reranking", () => {
  it("boosts lexical and structural matches after vector retrieval", () => {
    const reranked = rerankRetrievedChunks("como emitir boleto financeiro", [
      {
        id: 1,
        content: "Informações gerais do produto.",
        knowledgeDocumentId: 10,
        metadata: { chapter: "Visão geral" },
        similarity: 0.7
      },
      {
        id: 2,
        content: "Para emitir o boleto, acesse o menu financeiro.",
        knowledgeDocumentId: 10,
        metadata: { chapter: "Financeiro", section: "Emissão de boleto" },
        similarity: 0.62
      }
    ]);

    expect(reranked[0].id).toBe(2);
    expect(reranked[0].similarity).toBeGreaterThan(reranked[1].similarity);
  });

  it("loads neighbors only from the same published CMS version", async () => {
    (sequelize.query as jest.Mock).mockResolvedValueOnce([
      [
        {
          id: 3,
          content: "Passo seguinte do procedimento.",
          knowledgeDocumentId: 20,
          knowledgeAssetId: 20,
          knowledgeAssetVersionId: 30,
          metadata: { chunkIndex: 2 },
          similarity: 0.79
        }
      ]
    ]);

    const expanded = await expandRetrievedChunkNeighbors(
      1,
      [5],
      [
        {
          id: 2,
          content: "Passo principal.",
          knowledgeDocumentId: 20,
          knowledgeAssetId: 20,
          knowledgeAssetVersionId: 30,
          metadata: { chunkIndex: 1 },
          similarity: 0.8
        }
      ],
      1
    );

    const [sql, options] = (sequelize.query as jest.Mock).mock.calls[0];
    expect(String(sql)).toMatch(/publishedVersionId/);
    expect(String(sql)).toMatch(/knowledgeAssetVersionId/);
    expect(options.replacements.sourceId).toBe(30);
    expect(expanded.map(chunk => chunk.id)).toEqual([2, 3]);
  });

  it("deduplicates repeated content from concurrent ingestion rows", async () => {
    (sequelize.query as jest.Mock).mockResolvedValueOnce([
      [
        {
          id: 11,
          content: "Passo principal.",
          knowledgeDocumentId: 20,
          knowledgeAssetId: 20,
          knowledgeAssetVersionId: 30,
          metadata: { chunkIndex: 1 },
          similarity: 0.79
        }
      ]
    ]);

    const expanded = await expandRetrievedChunkNeighbors(
      1,
      [5],
      [
        {
          id: 10,
          content: "Passo principal.",
          knowledgeDocumentId: 20,
          knowledgeAssetId: 20,
          knowledgeAssetVersionId: 30,
          metadata: { chunkIndex: 1 },
          similarity: 0.8
        }
      ],
      1
    );

    expect(expanded).toHaveLength(1);
    expect(expanded[0].id).toBe(10);
  });
});
