import Whatsapp from "../../../models/Whatsapp";
import {
  StartWhatsAppSession,
  isWhatsAppSessionStarting
} from "../StartWhatsAppSession";

const initWASocket = jest.fn();
const removeWbot = jest.fn();
const getWbot = jest.fn();
const isWhatsAppSessionHealthy = jest.fn();

jest.mock("../../../libs/wbot", () => ({
  initWASocket: (...args: unknown[]) => initWASocket(...args),
  removeWbot: (...args: unknown[]) => removeWbot(...args),
  getWbot: (...args: unknown[]) => getWbot(...args),
  isWhatsAppSessionHealthy: (...args: unknown[]) =>
    isWhatsAppSessionHealthy(...args)
}));

jest.mock("../wbotMessageListener", () => ({
  ensureWbotMessageListener: jest.fn()
}));

jest.mock("../wbotMonitor", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../WhatsappService/SocketSendWhatsappUpdate", () => ({
  sendWhatsappUpdate: jest.fn()
}));

jest.mock("../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const buildWhatsapp = (id: number, status: string): Whatsapp => {
  const record = {
    id,
    companyId: 1,
    status,
    qrcode: "",
    update: jest.fn(async (values: Record<string, unknown>) => {
      Object.assign(record, values);
      return record;
    }),
    reload: jest.fn(async () => record)
  };

  return record as unknown as Whatsapp;
};

describe("StartWhatsAppSession opening guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WHATSAPP_START_TIMEOUT_MS = "50";
  });

  it("releases the guard when initWASocket never settles", async () => {
    // Baileys can leave the socket promise pending forever. The guard must be
    // released by the bounded start, otherwise the watchdog and the scheduled
    // restart skip this connection permanently and it stays DISCONNECTED.
    initWASocket.mockImplementation(() => new Promise(() => undefined));

    const whatsapp = buildWhatsapp(3, "DISCONNECTED");
    await StartWhatsAppSession(whatsapp, 1, true);

    expect(isWhatsAppSessionStarting(3)).toBe(false);
    expect(whatsapp.status).toBe("DISCONNECTED");
  });

  it("lets a later restart attempt reach initWASocket again", async () => {
    initWASocket.mockImplementationOnce(() => new Promise(() => undefined));
    initWASocket.mockImplementationOnce(async () => ({ id: 3 }));

    const whatsapp = buildWhatsapp(3, "DISCONNECTED");
    await StartWhatsAppSession(whatsapp, 1, true);
    await StartWhatsAppSession(whatsapp, 1, true);

    expect(initWASocket).toHaveBeenCalledTimes(2);
    expect(isWhatsAppSessionStarting(3)).toBe(false);
  });

  it("releases the guard when the start rejects", async () => {
    initWASocket.mockImplementation(async () => {
      throw new Error("boom");
    });

    const whatsapp = buildWhatsapp(4, "DISCONNECTED");
    await StartWhatsAppSession(whatsapp, 1, true).catch(() => undefined);

    expect(isWhatsAppSessionStarting(4)).toBe(false);
  });

  it("reuses the in-flight promise while a start is genuinely running", async () => {
    let resolveInit: (value: unknown) => void = () => undefined;
    initWASocket.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveInit = resolve;
        })
    );

    const whatsapp = buildWhatsapp(5, "DISCONNECTED");
    const first = StartWhatsAppSession(whatsapp, 1, true);

    expect(isWhatsAppSessionStarting(5)).toBe(true);

    const second = StartWhatsAppSession(whatsapp, 1, true);
    resolveInit({ id: 5 });
    await Promise.all([first, second]);

    expect(initWASocket).toHaveBeenCalledTimes(1);
    expect(isWhatsAppSessionStarting(5)).toBe(false);
  });
});
