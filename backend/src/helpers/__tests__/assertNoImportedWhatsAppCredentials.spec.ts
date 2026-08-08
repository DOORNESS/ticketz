/**
 * Guarda de credenciais WhatsApp importadas.
 *
 * O risco que ela cobre não é técnico, é operacional: alguém restaura um dump
 * de produção em homologação para ter dados realistas, e o ambiente de teste
 * reconecta números reais. Banco, Redis e bucket separados não impedem isso —
 * os dados foram copiados para dentro do ambiente isolado.
 */
import Whatsapp from "../../models/Whatsapp";
import BaileysKeys from "../../models/BaileysKeys";
import { assertNoImportedWhatsAppCredentials } from "../assertNoImportedWhatsAppCredentials";

jest.mock("../../models/Whatsapp");
jest.mock("../../models/BaileysKeys");

const mockState = (connections: unknown[], keyCount: number) => {
  (Whatsapp.findAll as jest.Mock).mockResolvedValue(connections);
  (BaileysKeys.count as jest.Mock).mockResolvedValue(keyCount);
};

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.ENVIRONMENT_NAME;
  delete process.env.ALLOW_IMPORTED_WHATSAPP;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("produção nunca é bloqueada", () => {
  it("sem ENVIRONMENT_NAME a guarda é inerte", async () => {
    mockState([{ id: 1, name: "Web G3" }], 500);

    await expect(
      assertNoImportedWhatsAppCredentials()
    ).resolves.toBeUndefined();
    // Nem sequer consulta o banco — produção não paga o custo.
    expect(Whatsapp.findAll).not.toHaveBeenCalled();
  });

  it("ENVIRONMENT_NAME=production também é inerte", async () => {
    process.env.ENVIRONMENT_NAME = "production";
    mockState([{ id: 1, name: "Web G3" }], 500);

    await expect(
      assertNoImportedWhatsAppCredentials()
    ).resolves.toBeUndefined();
    expect(Whatsapp.findAll).not.toHaveBeenCalled();
  });
});

describe("homologação", () => {
  beforeEach(() => {
    process.env.ENVIRONMENT_NAME = "homolog";
  });

  it("ambiente limpo passa", async () => {
    mockState([], 0);
    await expect(
      assertNoImportedWhatsAppCredentials()
    ).resolves.toBeUndefined();
  });

  it("bloqueia quando há conexão com sessão", async () => {
    mockState([{ id: 3, name: "Nivel" }], 0);

    await expect(assertNoImportedWhatsAppCredentials()).rejects.toThrow(
      /credenciais WhatsApp/i
    );
  });

  it("bloqueia quando há chaves Baileys, mesmo sem conexão ativa", async () => {
    mockState([], 1240);

    await expect(assertNoImportedWhatsAppCredentials()).rejects.toThrow(/1240/);
  });

  it("a mensagem ensina como limpar", async () => {
    mockState([{ id: 3, name: "Nivel" }], 10);

    await expect(assertNoImportedWhatsAppCredentials()).rejects.toThrow(
      /DELETE FROM "BaileysKeys"/
    );
  });

  it("libera com ALLOW_IMPORTED_WHATSAPP explícito", async () => {
    process.env.ALLOW_IMPORTED_WHATSAPP = "1";
    mockState([{ id: 3, name: "Nivel" }], 10);

    await expect(
      assertNoImportedWhatsAppCredentials()
    ).resolves.toBeUndefined();
  });

  it("valor inválido em ALLOW_IMPORTED_WHATSAPP não libera", async () => {
    process.env.ALLOW_IMPORTED_WHATSAPP = "talvez";
    mockState([{ id: 3, name: "Nivel" }], 10);

    await expect(assertNoImportedWhatsAppCredentials()).rejects.toThrow();
  });
});
