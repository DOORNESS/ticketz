/**
 * Transição de `brandIsolationEnforced`.
 *
 * O Setting é o interruptor que fecha a exceção "usuário comum sem vínculo vê
 * tudo". Estes testes travam os dois estados e, principalmente, a diferença
 * entre eles — é a única mudança da entrega capaz de tirar acesso de alguém
 * que hoje trabalha normalmente.
 */
import User from "../../../models/User";
import UserBrand from "../../../models/UserBrand";
import Ticket from "../../../models/Ticket";
import { userCanSeeTicketBrand } from "../../../helpers/canViewTicket";
import {
  getBrandAccessForUser,
  canViewBrand,
  canAttendBrand,
  resolveBrandFilterForQuery
} from "../BrandAccessService";
import { GetCompanySetting } from "../../../helpers/CheckSettings";

jest.mock("../../../models/User");
jest.mock("../../../models/UserBrand");
jest.mock("../../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn()
}));

const mockedSetting = GetCompanySetting as jest.Mock;

const NIVEL = 10;
const FORTMAX = 20;

const mockUser = (over: Record<string, unknown> = {}) =>
  (User.findByPk as jest.Mock).mockResolvedValue({
    id: 7,
    profile: "user",
    super: false,
    companyId: 1,
    ...over
  });

const mockLinks = (links: { brandId: number; canAttend: boolean }[]) =>
  (UserBrand.findAll as jest.Mock).mockResolvedValue(links);

const asTicket = (brandId: number | null) => ({ brandId }) as unknown as Ticket;

const asUser = (over: Record<string, unknown> = {}) =>
  ({
    id: 7,
    profile: "user",
    super: false,
    brands: [],
    queues: [],
    ...over
  }) as unknown as User;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("estado de transição (disabled) — padrão", () => {
  beforeEach(() => mockedSetting.mockResolvedValue("disabled"));

  it("funcionário sem vínculo continua trabalhando", async () => {
    mockUser();
    mockLinks([]);

    const access = await getBrandAccessForUser(7);
    expect(access.isUnrestricted).toBe(true);
    expect(canViewBrand(access, FORTMAX)).toBe(true);
  });

  it("funcionário COM vínculo já é isolado, mesmo antes de ligar", async () => {
    mockUser();
    mockLinks([{ brandId: NIVEL, canAttend: true }]);

    const access = await getBrandAccessForUser(7);
    expect(canViewBrand(access, NIVEL)).toBe(true);
    expect(canViewBrand(access, FORTMAX)).toBe(false);
  });
});

describe("estado final (enabled)", () => {
  beforeEach(() => mockedSetting.mockResolvedValue("enabled"));

  it("funcionário comum sem vínculo perde todo o acesso", async () => {
    mockUser();
    mockLinks([]);

    const access = await getBrandAccessForUser(7);

    expect(access.isUnrestricted).toBe(false);
    expect(access.visibleBrandIds).toEqual([]);
    expect(canViewBrand(access, NIVEL)).toBe(false);
    expect(canViewBrand(access, FORTMAX)).toBe(false);
    // E a consulta não devolve nada, em vez de devolver tudo.
    expect(resolveBrandFilterForQuery(access, [])).toEqual([]);
  });

  it("somente Nível → somente Nível", async () => {
    mockUser();
    mockLinks([{ brandId: NIVEL, canAttend: true }]);

    const access = await getBrandAccessForUser(7);
    expect(canViewBrand(access, NIVEL)).toBe(true);
    expect(canViewBrand(access, FORTMAX)).toBe(false);
  });

  it("somente Fortmax → somente Fortmax", async () => {
    mockUser();
    mockLinks([{ brandId: FORTMAX, canAttend: true }]);

    const access = await getBrandAccessForUser(7);
    expect(canViewBrand(access, FORTMAX)).toBe(true);
    expect(canViewBrand(access, NIVEL)).toBe(false);
  });

  it("Nível + Fortmax → ambas, com o mesmo login", async () => {
    mockUser();
    mockLinks([
      { brandId: NIVEL, canAttend: true },
      { brandId: FORTMAX, canAttend: false }
    ]);

    const access = await getBrandAccessForUser(7);
    expect(canViewBrand(access, NIVEL)).toBe(true);
    expect(canViewBrand(access, FORTMAX)).toBe(true);
    // Supervisão numa, atendimento na outra.
    expect(canAttendBrand(access, NIVEL)).toBe(true);
    expect(canAttendBrand(access, FORTMAX)).toBe(false);
  });

  it("admin mantém a política administrativa", async () => {
    mockUser({ profile: "admin" });

    const access = await getBrandAccessForUser(7);
    expect(access.isUnrestricted).toBe(true);
    expect(canViewBrand(access, FORTMAX)).toBe(true);
  });

  it("super mantém a política administrativa", async () => {
    mockUser({ profile: "user", super: true });

    const access = await getBrandAccessForUser(7);
    expect(access.isUnrestricted).toBe(true);
  });
});

// `userCanSeeTicketBrand` é o gate de marca dentro de `canViewTicket`.
// Assertar sobre ele isola a regra em teste do restante das regras de fila e
// posse, que têm cobertura própria.
describe("o gate síncrono muda junto", () => {
  it("mesmo usuário, resultado oposto conforme o Setting", () => {
    const duringMigration = asUser({ brandIsolationEnforced: false });
    const afterEnforcement = asUser({ brandIsolationEnforced: true });

    expect(userCanSeeTicketBrand(asTicket(NIVEL), duringMigration)).toBe(true);
    expect(userCanSeeTicketBrand(asTicket(NIVEL), afterEnforcement)).toBe(
      false
    );
  });

  it("quem já tem vínculo não é afetado pela virada", () => {
    const before = asUser({
      brands: [{ id: NIVEL }],
      brandIsolationEnforced: false
    });
    const after = asUser({
      brands: [{ id: NIVEL }],
      brandIsolationEnforced: true
    });

    expect(userCanSeeTicketBrand(asTicket(NIVEL), before)).toBe(true);
    expect(userCanSeeTicketBrand(asTicket(NIVEL), after)).toBe(true);
    expect(userCanSeeTicketBrand(asTicket(FORTMAX), before)).toBe(false);
    expect(userCanSeeTicketBrand(asTicket(FORTMAX), after)).toBe(false);
  });
});
