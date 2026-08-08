/**
 * A base "Respostas anexas" precisa nascer COM marca.
 *
 * `wireBrandLinesForCompany` roda a cada boot e refaz os vínculos do agente a
 * partir das bases daquela marca — `syncAgentKnowledgeBases` apaga tudo e
 * recria. Uma base de anexos com `brandId` nulo some dessa lista e é
 * desvinculada no próximo restart: o supervisor ensina, o conteúdo é indexado
 * e a IA deixa de enxergá-lo sem nenhum erro visível.
 *
 * Aconteceu em produção com "Respostas anexas — Nível". Estes casos travam a
 * correção nos dois lados: base nova e base antiga sem marca.
 */
jest.mock("../../../models/AiAgent", () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock("../../../models/KnowledgeAsset", () => ({
  __esModule: true,
  default: { findOne: jest.fn().mockResolvedValue(null) }
}));
jest.mock("../../../models/KnowledgeCategory", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() }
}));
jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/Whatsapp", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/KnowledgeDomain", () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock("../AiAgentKnowledgeBaseService", () => ({
  syncAgentKnowledgeBases: jest.fn(),
  listAgentKnowledgeBaseIds: jest.fn().mockResolvedValue([])
}));
jest.mock("../WireSupportLinesService", () => ({
  findByNameLoose: jest.fn().mockResolvedValue({ id: 7, name: "Nivel Cashback" })
}));

jest.mock("../../../models/Brand", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/KnowledgeBase", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn(), update: jest.fn() }
}));

import Brand from "../../../models/Brand";
import KnowledgeBase from "../../../models/KnowledgeBase";
import { ensureAnnexResponsesKnowledgeBase } from "../EnsureAnnexResponsesKnowledgeBase";

const NIVEL_BRAND_ID = 1;

describe("base de respostas anexas carrega a marca", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Brand.findOne as jest.Mock).mockResolvedValue({ id: NIVEL_BRAND_ID });
    (KnowledgeBase.findAll as jest.Mock).mockResolvedValue([]);
    (KnowledgeBase as unknown as { create: jest.Mock }).create = jest.fn();
  });

  it("base nova nasce com brandId da marca", async () => {
    (KnowledgeBase.findOne as jest.Mock).mockResolvedValue(null);
    const create = (KnowledgeBase as unknown as { create: jest.Mock }).create;
    create.mockResolvedValue({ id: 15, brandId: NIVEL_BRAND_ID, slug: "x" });

    await ensureAnnexResponsesKnowledgeBase(1, "nivel");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: NIVEL_BRAND_ID })
    );
  });

  it("base antiga sem marca é reparada", async () => {
    const update = jest.fn();
    (KnowledgeBase.findOne as jest.Mock).mockResolvedValue({
      id: 15,
      name: "Respostas anexas — Nível",
      slug: "respostas-anexas-nivel",
      active: true,
      knowledgeDomainId: 7,
      brandId: null,
      update
    });

    await ensureAnnexResponsesKnowledgeBase(1, "nivel");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: NIVEL_BRAND_ID })
    );
  });

  it("base que já tem marca não é tocada", async () => {
    const update = jest.fn();
    (KnowledgeBase.findOne as jest.Mock).mockResolvedValue({
      id: 15,
      name: "Respostas anexas — Nível",
      slug: "respostas-anexas-nivel",
      active: true,
      knowledgeDomainId: 7,
      brandId: NIVEL_BRAND_ID,
      update
    });

    await ensureAnnexResponsesKnowledgeBase(1, "nivel");

    expect(update).not.toHaveBeenCalled();
  });
});
