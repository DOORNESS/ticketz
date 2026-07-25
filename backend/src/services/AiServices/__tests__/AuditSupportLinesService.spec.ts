import * as WireSupportLinesService from "../WireSupportLinesService";
import { auditSupportLinesForCompany } from "../AuditSupportLinesService";

const mockWhatsappFindByPk = jest.fn();
const mockAgentQueueFindAll = jest.fn();
const mockAgentKbFindAll = jest.fn();
const mockDomainFindOne = jest.fn();
const mockDocumentCount = jest.fn();

jest.mock("../../../models/Whatsapp", () => ({
  __esModule: true,
  default: { findByPk: (...args: unknown[]) => mockWhatsappFindByPk(...args) }
}));

jest.mock("../../../models/AiAgentQueue", () => ({
  __esModule: true,
  default: { findAll: (...args: unknown[]) => mockAgentQueueFindAll(...args) }
}));

jest.mock("../../../models/AiAgentKnowledgeBase", () => ({
  __esModule: true,
  default: { findAll: (...args: unknown[]) => mockAgentKbFindAll(...args) }
}));

jest.mock("../../../models/KnowledgeDomain", () => ({
  __esModule: true,
  default: { findOne: (...args: unknown[]) => mockDomainFindOne(...args) }
}));

jest.mock("../../../models/KnowledgeDocument", () => ({
  __esModule: true,
  default: { count: (...args: unknown[]) => mockDocumentCount(...args) }
}));

describe("AuditSupportLinesService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocumentCount.mockResolvedValue(3);
    mockDomainFindOne.mockResolvedValue(null);
  });

  it("normalizeSupportLineName strips accents", () => {
    expect(WireSupportLinesService.normalizeSupportLineName("Suporte Nível")).toBe(
      "suporte nivel"
    );
  });

  it("reports ok when fortmax chain is complete", async () => {
    jest
      .spyOn(WireSupportLinesService, "findWhatsappByBrand")
      .mockImplementation(async (_companyId, brand) => {
        if (brand === "fortmax") {
          return { id: 1, name: "WebG3" } as never;
        }
        return { id: 2, name: "Nível" } as never;
      });

    mockWhatsappFindByPk.mockImplementation(async (id: number) => {
      if (id === 1) {
        return {
          id: 1,
          name: "WebG3",
          queues: [{ id: 10, name: "Suporte WebG3" }]
        };
      }

      return {
        id: 2,
        name: "Nível",
        queues: [{ id: 20, name: "Suporte Nível" }]
      };
    });

    mockAgentQueueFindAll.mockImplementation(async ({ where }) => {
      if (where.queueId === 10) {
        return [
          {
            aiAgent: {
              id: 100,
              name: "Webin Fortmax",
              active: true
            }
          }
        ];
      }

      return [
        {
          aiAgent: {
            id: 200,
            name: "Nivelton",
            active: true
          }
        }
      ];
    });

    mockAgentKbFindAll.mockImplementation(async ({ where }) => {
      if (where.aiAgentId === 100) {
        return [
          {
            knowledgeBase: {
              id: 1000,
              name: "Fortmax Site",
              knowledgeDomainId: 500,
              knowledgeDomain: { id: 500, name: "Fortmax" }
            }
          }
        ];
      }

      return [
        {
          knowledgeBase: {
            id: 2000,
            name: "Nivel site clientes",
            knowledgeDomainId: 600,
            knowledgeDomain: { id: 600, name: "Nível Cashback" }
          }
        },
        {
          knowledgeBase: {
            id: 2001,
            name: "Nivel empresa",
            knowledgeDomainId: 600,
            knowledgeDomain: { id: 600, name: "Nível Cashback" }
          }
        }
      ];
    });

    const audit = await auditSupportLinesForCompany(1);

    expect(audit.ok).toBe(true);
    expect(audit.lines).toHaveLength(2);
    expect(audit.lines[0].whatsapp?.name).toBe("WebG3");
    expect(audit.lines[1].agent?.name).toBe("Nivelton");
    expect(audit.lines[1].knowledgeBases).toHaveLength(2);
  });

  it("flags cross-brand agent on queue", async () => {
    jest
      .spyOn(WireSupportLinesService, "findWhatsappByBrand")
      .mockImplementation(async (_companyId, brand) => {
        if (brand === "fortmax") {
          return null;
        }
        return { id: 2, name: "Nível" } as never;
      });

    mockWhatsappFindByPk.mockResolvedValue({
      id: 2,
      name: "Nível",
      queues: [{ id: 20, name: "Suporte Nível" }]
    });
    mockAgentQueueFindAll.mockResolvedValue([
      {
        aiAgent: {
          id: 100,
          name: "Webin",
          active: true
        }
      }
    ]);
    mockAgentKbFindAll.mockResolvedValue([]);

    const audit = await auditSupportLinesForCompany(1);
    const nivel = audit.lines.find(row => row.line === "nivel");

    expect(nivel?.ok).toBe(false);
    expect(
      nivel?.issues.some(
        issue =>
          issue.code === "agent_cross_brand" ||
          issue.code === "agent_brand_mismatch"
      )
    ).toBe(true);
  });
});
