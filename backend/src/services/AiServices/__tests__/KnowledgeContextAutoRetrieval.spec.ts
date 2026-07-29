import KnowledgeBase from "../../../models/KnowledgeBase";
import KnowledgeDocument from "../../../models/KnowledgeDocument";
import sequelize from "../../../database";
import { createEmbedding } from "../ModelGateway";
import { retrieveKnowledgeForQuery } from "../RetrievalEngine";
import { buildKnowledgeContextForQuery } from "../KnowledgeContextService";

jest.mock("../../../models/KnowledgeBase", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));

jest.mock("../../../models/KnowledgeDocument", () => ({
  __esModule: true,
  default: {
    count: jest.fn(async () => 0),
    findAll: jest.fn(async () => [])
  }
}));

jest.mock("../../../models/KnowledgeChunk", () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []) }
}));

jest.mock("../../../database", () => ({
  __esModule: true,
  default: { query: jest.fn() }
}));

jest.mock("../ModelGateway", () => ({
  createEmbedding: jest.fn()
}));

jest.mock("../RetrievalEngine", () => ({
  retrieveKnowledgeForQuery: jest.fn(),
  searchKnowledgeChunksByText: jest.fn(async () => [])
}));

describe("KnowledgeContextService automatic retrieval", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (KnowledgeBase.findAll as jest.Mock).mockResolvedValue([]);
    (KnowledgeDocument.count as jest.Mock).mockResolvedValue(0);
    (sequelize.query as jest.Mock).mockImplementation(async (sql: string) =>
      String(sql).includes("COUNT(*)") ? [[{ count: 183 }]] : [[]]
    );
    (createEmbedding as jest.Mock).mockResolvedValue([0.1, 0.2]);
    (retrieveKnowledgeForQuery as jest.Mock).mockResolvedValue([
      {
        id: 4989,
        content:
          "A empresa pode criar campanhas de cashback para fidelizar clientes e aumentar recorrência.",
        knowledgeDocumentId: null,
        metadata: {},
        similarity: 0.73
      }
    ]);
  });

  it("retrieves query-relevant chunks for a large published CMS corpus", async () => {
    const result = await buildKnowledgeContextForQuery({
      companyId: 1,
      knowledgeBaseIds: [5],
      userText: "Quais são os benefícios do cashback para empresas?",
      loadStrategy: "auto",
      skipReingest: true
    });

    expect(createEmbedding).toHaveBeenCalled();
    expect(retrieveKnowledgeForQuery).toHaveBeenCalled();
    expect(result.usedChunks).toHaveLength(1);
    expect(result.usedChunks[0].id).toBe(4989);
    expect(result.contextBlock).toMatch(/fidelizar clientes/i);
  });

  it("excludes weak chunks and does not dump the first published chunks", async () => {
    (retrieveKnowledgeForQuery as jest.Mock).mockResolvedValueOnce([
      {
        id: 12,
        content: "Trecho do início do manual sem relação com a pergunta.",
        knowledgeDocumentId: null,
        metadata: {},
        similarity: 0.12
      }
    ]);

    const result = await buildKnowledgeContextForQuery({
      companyId: 1,
      knowledgeBaseIds: [5],
      userText: "Como cancelar uma cobrança duplicada?",
      loadStrategy: "auto",
      skipReingest: true
    });

    expect(result.usedChunks).toEqual([]);
    expect(result.contextBlock).toBe("");
    expect(result.hasReadyDocuments).toBe(true);
    expect(
      (sequelize.query as jest.Mock).mock.calls.some(([sql]) =>
        String(sql).includes("ORDER BY kc.id ASC")
      )
    ).toBe(false);
  });
});
