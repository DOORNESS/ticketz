import {
  dismissalStorageKey,
  isTicketDismissed,
  pruneDismissals,
  readDismissals,
  withDismissedTicket,
  withoutDismissedTicket,
  writeDismissals
} from "../notificationDismissals";

const ONTEM = "2026-08-11T10:00:00.000Z";
const HOJE = "2026-08-12T10:00:00.000Z";

describe("dispensa de notificação do sino", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("dispensar tira do sino e o refetch do mesmo estado não traz de volta", () => {
    const ticket = { id: 7, updatedAt: ONTEM };
    const map = withDismissedTicket({}, ticket);

    expect(isTicketDismissed(map, ticket)).toBe(true);
    // mesmo objeto vindo de novo do /tickets
    expect(isTicketDismissed(map, { id: 7, updatedAt: ONTEM })).toBe(true);
  });

  it("mensagem nova (updatedAt maior) volta a notificar", () => {
    const map = withDismissedTicket({}, { id: 7, updatedAt: ONTEM });

    expect(isTicketDismissed(map, { id: 7, updatedAt: HOJE })).toBe(false);
  });

  it("undismiss explícito reabre — é o caminho do socket de mensagem nova", () => {
    const map = withDismissedTicket({}, { id: 7, updatedAt: HOJE });
    const reaberto = withoutDismissedTicket(map, 7);

    expect(isTicketDismissed(reaberto, { id: 7, updatedAt: HOJE })).toBe(false);
  });

  it("ticket nunca dispensado não é filtrado", () => {
    expect(isTicketDismissed({}, { id: 9, updatedAt: HOJE })).toBe(false);
  });

  it("sem updatedAt continua dispensado — socket é quem reabre", () => {
    const map = withDismissedTicket({}, { id: 7 });

    expect(isTicketDismissed(map, { id: 7 })).toBe(true);
  });

  it("persiste por usuário e sobrevive ao reload", () => {
    writeDismissals(42, withDismissedTicket({}, { id: 7, updatedAt: HOJE }));

    expect(readDismissals(42)).toEqual({ 7: HOJE });
    expect(readDismissals(43)).toEqual({});
    expect(dismissalStorageKey(42)).toBe("ticketz:notifDismissed:42");
  });

  it("poda mantém as dispensas mais recentes", () => {
    const grande = {};
    for (let i = 0; i < 260; i += 1) {
      grande[i] = `2026-08-12T${String(i % 24).padStart(2, "0")}:00:00.000Z`;
    }

    const podado = pruneDismissals(grande);
    expect(Object.keys(podado)).toHaveLength(200);
  });

  it("storage indisponível não quebra a leitura", () => {
    const spy = jest
      .spyOn(window.localStorage.__proto__, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(readDismissals(1)).toEqual({});
    spy.mockRestore();
  });
});
