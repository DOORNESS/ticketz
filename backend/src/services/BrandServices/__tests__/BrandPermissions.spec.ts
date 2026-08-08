/**
 * Permissões de funcionário por marca — os cenários que o backend precisa
 * barrar mesmo com o frontend cooperando.
 */
import User from "../../../models/User";
import UserBrand from "../../../models/UserBrand";
import Ticket from "../../../models/Ticket";
import { userCanSeeTicketBrand } from "../../../helpers/canViewTicket";
import {
  buildBrandIdentityReply,
  buildBrandInformationalFallback,
  buildBrandOperationalRules
} from "../BrandPersonaService";
import { getBrandAccessForUser } from "../BrandAccessService";
import { GetCompanySetting } from "../../../helpers/CheckSettings";

jest.mock("../../../models/User");
jest.mock("../../../models/UserBrand");
jest.mock("../../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn()
}));

const mockedGetCompanySetting = GetCompanySetting as jest.Mock;

const NIVEL = 10;
const FORTMAX = 20;

const asUser = (over: Record<string, unknown> = {}) =>
  ({
    id: 7,
    profile: "user",
    super: false,
    brands: [],
    ...over
  }) as unknown as User;

const asTicket = (brandId: number | null) => ({ brandId }) as unknown as Ticket;

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetCompanySetting.mockResolvedValue("disabled");
});

describe("1-3. isolamento entre marcas", () => {
  it("funcionário só de Nível não vê ticket Fortmax", () => {
    const user = asUser({ brands: [{ id: NIVEL }] });

    expect(userCanSeeTicketBrand(asTicket(NIVEL), user)).toBe(true);
    expect(userCanSeeTicketBrand(asTicket(FORTMAX), user)).toBe(false);
  });

  it("funcionário só de Fortmax não vê ticket Nível", () => {
    const user = asUser({ brands: [{ id: FORTMAX }] });

    expect(userCanSeeTicketBrand(asTicket(FORTMAX), user)).toBe(true);
    expect(userCanSeeTicketBrand(asTicket(NIVEL), user)).toBe(false);
  });

  it("funcionário das duas atende as duas com o mesmo login", () => {
    const user = asUser({ brands: [{ id: NIVEL }, { id: FORTMAX }] });

    expect(userCanSeeTicketBrand(asTicket(NIVEL), user)).toBe(true);
    expect(userCanSeeTicketBrand(asTicket(FORTMAX), user)).toBe(true);
  });

  it("admin continua vendo tudo", () => {
    const admin = asUser({ profile: "admin" });
    expect(userCanSeeTicketBrand(asTicket(FORTMAX), admin)).toBe(true);
  });

  it("ticket sem marca não vaza para funcionário restrito", () => {
    const user = asUser({ brands: [{ id: NIVEL }] });
    expect(userCanSeeTicketBrand(asTicket(null), user)).toBe(false);
  });
});

describe("15. fechamento seguro da exceção de transição", () => {
  it("sem vínculo e sem enforcement: mantém acesso (migração)", async () => {
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: 7,
      profile: "user",
      super: false,
      companyId: 1
    });
    (UserBrand.findAll as jest.Mock).mockResolvedValue([]);
    mockedGetCompanySetting.mockResolvedValue("disabled");

    const access = await getBrandAccessForUser(7);
    expect(access.isUnrestricted).toBe(true);
  });

  it("sem vínculo e COM enforcement: perde o acesso (estado final)", async () => {
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: 7,
      profile: "user",
      super: false,
      companyId: 1
    });
    (UserBrand.findAll as jest.Mock).mockResolvedValue([]);
    mockedGetCompanySetting.mockResolvedValue("enabled");

    const access = await getBrandAccessForUser(7);
    expect(access.isUnrestricted).toBe(false);
    expect(access.visibleBrandIds).toEqual([]);
  });

  it("o gate síncrono acompanha o mesmo Setting", () => {
    const legacy = asUser({ brandIsolationEnforced: false });
    const enforced = asUser({ brandIsolationEnforced: true });

    expect(userCanSeeTicketBrand(asTicket(NIVEL), legacy)).toBe(true);
    expect(userCanSeeTicketBrand(asTicket(NIVEL), enforced)).toBe(false);
  });

  it("admin não é afetado pelo enforcement", async () => {
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: 1,
      profile: "admin",
      super: false,
      companyId: 1
    });
    mockedGetCompanySetting.mockResolvedValue("enabled");

    const access = await getBrandAccessForUser(1);
    expect(access.isUnrestricted).toBe(true);
  });
});

describe("persona vem dos dados da marca, não do código", () => {
  const brand = {
    name: "Marca Três",
    identityName: "Bot3",
    identityReply: "Me chamo Bot3, assistente da Marca Três.",
    escalationUrl: "https://marca3.com/chamado",
    informationalFallback: "Não encontrei esse procedimento na base.",
    supportContacts: [
      { name: "Ana", role: "suporte", whatsapp: "11 90000-0000" }
    ],
    vocabulary: ["marca3", "clube3"]
  } as never;

  it("identidade sai do registro", () => {
    expect(buildBrandIdentityReply(brand)).toContain("Bot3");
  });

  it("identidade derivada quando só há o nome", () => {
    expect(buildBrandIdentityReply({ identityName: "Zé" } as never)).toBe(
      "Me chamo Zé."
    );
  });

  it("fallback combina texto e contatos configurados", () => {
    const fallback = buildBrandInformationalFallback(brand) || "";
    expect(fallback).toContain("Não encontrei esse procedimento");
    expect(fallback).toContain("Ana");
    expect(fallback).toContain("11 90000-0000");
  });

  it("sem contatos, usa a URL de escalação", () => {
    const fallback =
      buildBrandInformationalFallback({
        escalationUrl: "https://x.com/chamado",
        supportContacts: []
      } as never) || "";
    expect(fallback).toContain("https://x.com/chamado");
  });

  it("regras operacionais saem do vocabulário da marca", () => {
    const rules = buildBrandOperationalRules(brand) || "";
    expect(rules).toContain("Marca Três");
    expect(rules).toContain("marca3");
    expect(rules).toContain("clube3");
    // Marca com contato configurado não recebe a proibição de telefone.
    expect(rules).not.toContain("Nunca informe telefone");
  });

  it("marca sem contatos proíbe informar telefone", () => {
    const rules =
      buildBrandOperationalRules({
        name: "Marca Sem Telefone",
        supportContacts: [],
        vocabulary: []
      } as never) || "";
    expect(rules).toContain("Nunca informe telefone");
  });

  it("nenhuma marca hardcoded aparece nas regras geradas", () => {
    const rules = buildBrandOperationalRules(brand) || "";
    expect(rules.toLowerCase()).not.toContain("nivel");
    expect(rules.toLowerCase()).not.toContain("fortmax");
  });
});
