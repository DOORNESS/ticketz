/**
 * Critérios de aceite da arquitetura multimarca.
 *
 * Cada bloco abaixo corresponde a um item da lista acordada. O que exige
 * Postgres (migration e backfill sobre dados reais) está marcado no relatório
 * como pendente de verificação — aqui fica o que é comprovável sem banco.
 */
import Brand from "../../../models/Brand";
import Whatsapp from "../../../models/Whatsapp";
import AiAgent from "../../../models/AiAgent";
import KnowledgeBase from "../../../models/KnowledgeBase";
import User from "../../../models/User";
import UserBrand from "../../../models/UserBrand";
import {
  resolveBrandIdForWhatsapp,
  legacyMatchBrandSlugByName
} from "../BrandResolutionService";
import {
  getAgentForBrand,
  restrictKnowledgeBasesToBrand
} from "../BrandAiConfigService";
import {
  getBrandAccessForUser,
  canViewBrand,
  canAttendBrand,
  resolveBrandFilterForQuery
} from "../BrandAccessService";

jest.mock("../../../models/Brand");
jest.mock("../../../models/Whatsapp");
jest.mock("../../../models/AiAgent");
jest.mock("../../../models/KnowledgeBase");
jest.mock("../../../models/User");
jest.mock("../../../models/UserBrand");
// O acesso por marca consulta o Setting `brandIsolationEnforced`; aqui o
// cenário é o de transição (desligado), que é o padrão em produção hoje.
jest.mock("../../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn(async () => "disabled")
}));

const NIVEL = { id: 10, slug: "nivel", companyId: 1 };
const FORTMAX = { id: 20, slug: "fortmax", companyId: 1 };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("1-3. origem define a marca, e o nome não manda mais", () => {
  it("mensagem da conexão Nível resolve a Brand Nível pela FK", async () => {
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      id: 5,
      name: "Nivel",
      brandId: NIVEL.id,
      companyId: 1
    });
    (Brand.findOne as jest.Mock).mockResolvedValue(NIVEL);

    await expect(resolveBrandIdForWhatsapp(1, 5)).resolves.toBe(NIVEL.id);
  });

  it("mensagem da conexão Fortmax resolve a Brand Fortmax pela FK", async () => {
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      id: 6,
      name: "Web G3",
      brandId: FORTMAX.id,
      companyId: 1
    });
    (Brand.findOne as jest.Mock).mockResolvedValue(FORTMAX);

    await expect(resolveBrandIdForWhatsapp(1, 6)).resolves.toBe(FORTMAX.id);
  });

  it("renomear a conexão NÃO muda a marca — a FK vence o nome", async () => {
    // Nome passa a sugerir Fortmax, mas a FK continua apontando para Nível.
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      id: 5,
      name: "Fortmax Suporte Renomeado",
      brandId: NIVEL.id,
      companyId: 1
    });
    (Brand.findOne as jest.Mock).mockResolvedValue(NIVEL);

    await expect(resolveBrandIdForWhatsapp(1, 5)).resolves.toBe(NIVEL.id);
    // O casamento por nome nem é consultado quando existe FK.
    expect(legacyMatchBrandSlugByName("Fortmax Suporte Renomeado")).toBe(
      "fortmax"
    );
  });

  it("sem FK, cai no fallback legado por nome (transição)", async () => {
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      id: 7,
      name: "Nivel Cashback",
      brandId: null,
      companyId: 1
    });
    (Brand.findOne as jest.Mock).mockResolvedValue(NIVEL);

    await expect(resolveBrandIdForWhatsapp(1, 7)).resolves.toBe(NIVEL.id);
  });

  it("conexão desconhecida e sem FK não inventa marca", async () => {
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      id: 8,
      name: "Conexão Nova",
      brandId: null,
      companyId: 1
    });

    await expect(resolveBrandIdForWhatsapp(1, 8)).resolves.toBeNull();
  });
});

describe("4-5, 14. IA e conhecimento isolados por marca", () => {
  it("agente vem do vínculo com a marca, não da fila", async () => {
    (AiAgent.findOne as jest.Mock).mockResolvedValue({
      id: 3,
      name: "Nivelton",
      brandId: NIVEL.id
    });

    const agent = await getAgentForBrand(1, NIVEL.id);

    expect(agent?.name).toBe("Nivelton");
    expect((AiAgent.findOne as jest.Mock).mock.calls[0][0].where).toMatchObject(
      {
        companyId: 1,
        brandId: NIVEL.id,
        active: true
      }
    );
  });

  it("base de outra marca é removida do contexto", async () => {
    (KnowledgeBase.findAll as jest.Mock).mockResolvedValue([
      { id: 100, brandId: NIVEL.id },
      { id: 200, brandId: FORTMAX.id }
    ]);

    const allowed = await restrictKnowledgeBasesToBrand(
      1,
      NIVEL.id,
      [100, 200]
    );

    expect(allowed).toEqual([100]);
    expect(allowed).not.toContain(200);
  });

  it("base sem marca (legado) é preservada — não deixa o agente sem contexto", async () => {
    (KnowledgeBase.findAll as jest.Mock).mockResolvedValue([
      { id: 100, brandId: NIVEL.id },
      { id: 300, brandId: null }
    ]);

    await expect(
      restrictKnowledgeBasesToBrand(1, NIVEL.id, [100, 300])
    ).resolves.toEqual([100, 300]);
  });

  it("ticket sem marca não restringe nada", async () => {
    await expect(
      restrictKnowledgeBasesToBrand(1, null, [100, 200])
    ).resolves.toEqual([100, 200]);
  });
});

describe("7-9, 11. filtro global respeita a permissão", () => {
  const mockUser = (profile: string, isSuper = false) =>
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: 7,
      profile,
      super: isSuper,
      companyId: 1
    });

  const mockLinks = (
    links: { brandId: number; canAttend: boolean }[]
  ): void => {
    (UserBrand.findAll as jest.Mock).mockResolvedValue(links);
  };

  it("admin enxerga todas as marcas", async () => {
    mockUser("admin");
    const access = await getBrandAccessForUser(7);

    expect(access.isUnrestricted).toBe(true);
    expect(canViewBrand(access, NIVEL.id)).toBe(true);
    expect(canViewBrand(access, FORTMAX.id)).toBe(true);
  });

  it("atendente só de Nível não vê Fortmax", async () => {
    mockUser("user");
    mockLinks([{ brandId: NIVEL.id, canAttend: true }]);

    const access = await getBrandAccessForUser(7);

    expect(canViewBrand(access, NIVEL.id)).toBe(true);
    expect(canViewBrand(access, FORTMAX.id)).toBe(false);
  });

  it("atendente das duas marcas vê as duas com o mesmo login", async () => {
    mockUser("user");
    mockLinks([
      { brandId: NIVEL.id, canAttend: true },
      { brandId: FORTMAX.id, canAttend: true }
    ]);

    const access = await getBrandAccessForUser(7);

    expect(canViewBrand(access, NIVEL.id)).toBe(true);
    expect(canViewBrand(access, FORTMAX.id)).toBe(true);
  });

  it("supervisor pode ver sem poder atender", async () => {
    mockUser("user");
    mockLinks([{ brandId: NIVEL.id, canAttend: false }]);

    const access = await getBrandAccessForUser(7);

    expect(canViewBrand(access, NIVEL.id)).toBe(true);
    expect(canAttendBrand(access, NIVEL.id)).toBe(false);
  });

  it("querystring não amplia o alcance de um atendente restrito", async () => {
    mockUser("user");
    mockLinks([{ brandId: NIVEL.id, canAttend: true }]);

    const access = await getBrandAccessForUser(7);
    // A UI pede Fortmax; a interseção derruba o pedido.
    expect(resolveBrandFilterForQuery(access, [FORTMAX.id])).toEqual([]);
    expect(resolveBrandFilterForQuery(access, [NIVEL.id])).toEqual([NIVEL.id]);
  });

  it('"Todas" para o restrito significa só as permitidas', async () => {
    mockUser("user");
    mockLinks([{ brandId: NIVEL.id, canAttend: true }]);

    const access = await getBrandAccessForUser(7);
    expect(resolveBrandFilterForQuery(access, [])).toEqual([NIVEL.id]);
  });

  it('"Todas" para admin não aplica filtro nenhum', async () => {
    mockUser("admin");
    const access = await getBrandAccessForUser(7);
    expect(resolveBrandFilterForQuery(access, [])).toBeNull();
  });

  it("usuário legado sem vínculo mantém acesso — transição segura", async () => {
    mockUser("user");
    mockLinks([]);

    const access = await getBrandAccessForUser(7);

    expect(access.isUnrestricted).toBe(true);
    expect(canViewBrand(access, FORTMAX.id)).toBe(true);
  });
});

describe("12-13. marca nova não exige condicional no código", () => {
  it("uma terceira marca funciona pelo mesmo caminho genérico", async () => {
    const BRAND3 = { id: 30, slug: "marca3", companyId: 1 };

    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      id: 9,
      name: "Qualquer Nome",
      brandId: BRAND3.id,
      companyId: 1
    });
    (Brand.findOne as jest.Mock).mockResolvedValue(BRAND3);
    (AiAgent.findOne as jest.Mock).mockResolvedValue({
      id: 44,
      name: "Bot 3",
      brandId: BRAND3.id
    });
    (KnowledgeBase.findAll as jest.Mock).mockResolvedValue([
      { id: 900, brandId: BRAND3.id },
      { id: 100, brandId: NIVEL.id }
    ]);

    // Resolução, agente e isolamento funcionam sem nenhum `if slug === ...`.
    await expect(resolveBrandIdForWhatsapp(1, 9)).resolves.toBe(BRAND3.id);
    await expect(getAgentForBrand(1, BRAND3.id)).resolves.toMatchObject({
      name: "Bot 3"
    });
    await expect(
      restrictKnowledgeBasesToBrand(1, BRAND3.id, [900, 100])
    ).resolves.toEqual([900]);
  });

  it("o nome da conexão é irrelevante quando existe FK", async () => {
    // "Qualquer Nome" não casa com nenhum padrão legado…
    expect(legacyMatchBrandSlugByName("Qualquer Nome")).toBeNull();
    // …e ainda assim a marca é resolvida.
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      id: 9,
      name: "Qualquer Nome",
      brandId: 30,
      companyId: 1
    });
    (Brand.findOne as jest.Mock).mockResolvedValue({ id: 30, slug: "marca3" });

    await expect(resolveBrandIdForWhatsapp(1, 9)).resolves.toBe(30);
  });
});
