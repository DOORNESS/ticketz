const ensureAnnexResponsesKnowledgeBase = jest.fn();
const resolveAnnexResponsesBrand = jest.fn();
const createDocument = jest.fn();
const ingestKnowledgeDocument = jest.fn();

jest.mock("../../../models/AiKnowledgeSuggestion", () => ({
  __esModule: true,
  default: { create: jest.fn(async () => ({})) }
}));
jest.mock("../../../models/KnowledgeDocument", () => ({
  __esModule: true,
  default: { create: createDocument }
}));
jest.mock("../../../models/KnowledgeBase", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []) }
}));
jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/KnowledgeAsset", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/KnowledgeAssetVersion", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/KnowledgeChunk", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../StorageService/StorageService", () => ({
  __esModule: true,
  default: {
    ensureReady: jest.fn(async () => undefined),
    uploadBuffer: jest.fn(async () => ({ key: "knowledge/answer.txt" }))
  }
}));
jest.mock("../IngestKnowledgeDocumentService", () => ({
  ingestKnowledgeDocument
}));
jest.mock("../EnsureAnnexResponsesKnowledgeBase", () => ({
  ensureAnnexResponsesKnowledgeBase,
  ensureAnnexCategoryId: jest.fn(),
  resolveAnnexResponsesBrand
}));
jest.mock("../KnowledgeCms/AiKbCmsFeatureFlag", () => ({
  isKbCmsEnabledForCompany: jest.fn(async () => false)
}));
jest.mock("../KnowledgeCms/KnowledgeAssetCmsService", () => ({
  createKnowledgeAsset: jest.fn(),
  promoteAndPublishKnowledgeAsset: jest.fn()
}));
jest.mock("../KnowledgeCms/KnowledgeAssetVersionService", () => ({
  createAssetVersion: jest.fn(),
  getNextVersionNumber: jest.fn()
}));
jest.mock("../ModelGateway", () => ({
  chatCompletion: jest.fn()
}));

import { annexHumanResponseToBase } from "../AiKnowledgeSuggestionService";

describe("Annex responses brand isolation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createDocument.mockResolvedValue({ id: 900 });
    ingestKnowledgeDocument.mockResolvedValue(undefined);
  });

  it.each([
    ["nivel", 101],
    ["fortmax", 202]
  ])("writes %s answers only to its brand base", async (brand, baseId) => {
    resolveAnnexResponsesBrand.mockResolvedValue(brand);
    ensureAnnexResponsesKnowledgeBase.mockResolvedValue({ id: baseId });

    const result = await annexHumanResponseToBase({
      companyId: 1,
      ticketId: 77,
      title: "Resposta validada",
      content: "Procedimento aprovado.",
      userId: 5
    });

    expect(ensureAnnexResponsesKnowledgeBase).toHaveBeenCalledWith(1, brand);
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeBaseId: baseId })
    );
    expect(result.base.id).toBe(baseId);
  });
});
