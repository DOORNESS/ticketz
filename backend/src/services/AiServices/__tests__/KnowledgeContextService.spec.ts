import KnowledgeBase from "../../../models/KnowledgeBase";
import {
  loadKnowledgeBaseDescriptionChunks,
  buildKnowledgeContextForQuery
} from "../KnowledgeContextService";

jest.mock("../../../models/KnowledgeBase", () => ({
  __esModule: true,
  default: {
    findAll: jest.fn()
  }
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
  default: {
    findAll: jest.fn(async () => [])
  }
}));

jest.mock("../../../database", () => ({
  __esModule: true,
  default: {
    query: jest.fn(async (sql: string) => {
      if (String(sql).includes("COUNT(*)")) {
        return [[{ count: 0 }]];
      }
      return [[]];
    })
  }
}));

jest.mock("../KnowledgeCms/AiKbCmsFeatureFlag", () => ({
  isKbCmsEnabledForCompany: jest.fn(async () => false)
}));

describe("KnowledgeContextService description fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads long base descriptions as ranked context chunks", async () => {
    (KnowledgeBase.findAll as jest.Mock).mockResolvedValue([
      {
        id: 5,
        name: "Nivel site clientes",
        description:
          "# Manual Oficial do Consumidor – Nível Cashback\n\n## O que é Cashback?\n\nCashback significa dinheiro de volta.\n\n---\n\n## Para que serve a Nível?\n\nA Nível é uma plataforma completa de benefícios."
      }
    ]);

    const chunks = await loadKnowledgeBaseDescriptionChunks(
      1,
      [5],
      "Sabe o que é nível cashback?"
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some(chunk => /cashback/i.test(chunk.content))).toBe(true);
    expect(chunks[0].documentTitle).toBe("Nivel site clientes");
  });

  it("buildKnowledgeContextForQuery uses description when no indexed documents exist", async () => {
    (KnowledgeBase.findAll as jest.Mock).mockImplementation(
      async (options: { attributes?: string[] }) => {
        if (options.attributes?.includes("knowledgeDomainId")) {
          return [{ id: 5, knowledgeDomainId: 10 }];
        }

        if (options.attributes?.includes("description")) {
          return [
            {
              id: 5,
              name: "Nivel site clientes",
              description:
                "# Manual Oficial do Consumidor – Nível Cashback\n\n## O que é Cashback?\n\nCashback significa dinheiro de volta. A Nível ajuda empresas a fidelizar clientes."
            }
          ];
        }

        return [];
      }
    );

    const result = await buildKnowledgeContextForQuery({
      companyId: 1,
      knowledgeBaseIds: [5],
      userText: "Sabe o que é nível cashback?",
      loadStrategy: "full"
    });

    expect(result.hasReadyDocuments).toBe(true);
    expect(result.contextBlock).toMatch(/Cashback/i);
    expect(result.contextBlock).not.toMatch(/base deste canal ainda está limitada/i);
  });
});
