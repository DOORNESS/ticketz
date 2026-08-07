import { shouldShowTicketInList } from "../ticketListVisibility";

/**
 * A aba IA existe para o supervisor acompanhar o que o robô está atendendo,
 * inclusive depois que o caso trava (handoff) ou a IA é pausada.
 *
 * O backend (`TicketOperationalStateService`) só marca `listColumn: "ai"`
 * quando `isAiHandlingTicket` é verdadeiro — o que exclui handoff pendente e
 * IA pausada. Enquanto isso, `shouldShowTicketInList` aceita todo ticket com
 * `aiAgentId`, sem dono e não fechado. Essa assimetria é proposital, mas
 * significa que a lista NÃO pode ser filtrada por `listColumn`: era isso que
 * apagava a aba no primeiro evento de socket.
 *
 * Estes testes travam os dois lados do contrato.
 */

const supervisionArgs = ticket => ({
  ticket,
  status: undefined,
  supervision: true,
  listMode: "ai",
  selectedQueueIds: [],
  selectedWhatsappIds: [],
  profile: "admin",
  showAll: true,
  userId: 7,
  superUser: false,
  aiFilter: "ai_supervision"
});

const baseTicket = {
  id: 1,
  aiAgentId: 3,
  userId: null,
  status: "open",
  queueId: 2,
  whatsappId: 5
};

describe("aba IA — supervisão", () => {
  it("mantém ticket que a IA está atendendo", () => {
    expect(
      shouldShowTicketInList(
        supervisionArgs({ ...baseTicket, aiHandoff: false, aiPaused: false })
      )
    ).toBe(true);
  });

  it("mantém ticket em handoff aguardando humano", () => {
    // listColumn do backend aqui é "pending" — não pode sumir da aba.
    expect(
      shouldShowTicketInList(
        supervisionArgs({
          ...baseTicket,
          status: "pending",
          aiHandoff: true,
          aiPaused: false,
          operationalState: { listColumn: "pending" }
        })
      )
    ).toBe(true);
  });

  it("mantém ticket com IA pausada", () => {
    // listColumn do backend aqui é "open".
    expect(
      shouldShowTicketInList(
        supervisionArgs({
          ...baseTicket,
          aiPaused: true,
          operationalState: { listColumn: "open" }
        })
      )
    ).toBe(true);
  });

  it("mantém ticket transferido pela IA em modo operacional", () => {
    expect(
      shouldShowTicketInList(
        supervisionArgs({
          ...baseTicket,
          status: "pending",
          aiHandoff: true,
          aiHandoffMode: "operational",
          operationalState: { listColumn: "pending" }
        })
      )
    ).toBe(true);
  });

  it("remove ticket assumido por um humano", () => {
    expect(
      shouldShowTicketInList(
        supervisionArgs({
          ...baseTicket,
          userId: 9,
          operationalState: { listColumn: "open" }
        })
      )
    ).toBe(false);
  });

  it("remove ticket fechado", () => {
    expect(
      shouldShowTicketInList(
        supervisionArgs({
          ...baseTicket,
          status: "closed",
          operationalState: { listColumn: "closed" }
        })
      )
    ).toBe(false);
  });

  it("remove ticket sem agente de IA", () => {
    expect(
      shouldShowTicketInList(
        supervisionArgs({ ...baseTicket, aiAgentId: null })
      )
    ).toBe(false);
  });

  it("respeita o filtro de linha do WhatsApp", () => {
    const args = supervisionArgs(baseTicket);
    expect(shouldShowTicketInList({ ...args, selectedWhatsappIds: [99] })).toBe(
      false
    );
    expect(shouldShowTicketInList({ ...args, selectedWhatsappIds: [5] })).toBe(
      true
    );
  });

  it("aceita ticket de IA sem fila (supervisão ignora escopo de fila)", () => {
    expect(
      shouldShowTicketInList(
        supervisionArgs({ ...baseTicket, queueId: null, aiHandoff: false })
      )
    ).toBe(true);
  });
});

describe("aba IA — atendente comum (ai_handling)", () => {
  const attendantArgs = ticket => ({
    ...supervisionArgs(ticket),
    supervision: false,
    profile: "user",
    showAll: false,
    aiFilter: "ai_handling"
  });

  it("mantém ticket ativo da IA na fila do atendente", () => {
    expect(
      shouldShowTicketInList(
        attendantArgs({ ...baseTicket, aiHandoff: false, aiPaused: false })
      )
    ).toBe(true);
  });

  it("remove ticket que a IA não está mais conduzindo", () => {
    expect(
      shouldShowTicketInList(
        attendantArgs({ ...baseTicket, status: "pending", aiHandoff: true })
      )
    ).toBe(false);
  });
});
