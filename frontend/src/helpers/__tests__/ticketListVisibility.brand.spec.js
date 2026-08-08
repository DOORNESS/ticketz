import {
  shouldShowTicketInList,
  ticketMatchesSelectedBrands
} from "../ticketListVisibility";

const NIVEL = 10;
const FORTMAX = 20;

const baseArgs = ticket => ({
  ticket,
  status: "open",
  supervision: false,
  listMode: undefined,
  selectedQueueIds: [],
  selectedWhatsappIds: [],
  selectedBrandIds: [],
  profile: "admin",
  showAll: true,
  userId: 7,
  superUser: false
});

const nivelTicket = {
  id: 1,
  brandId: NIVEL,
  status: "open",
  queueId: 2,
  whatsappId: 5
};
const fortmaxTicket = {
  id: 2,
  brandId: FORTMAX,
  status: "open",
  queueId: 3,
  whatsappId: 6
};

describe("ticketMatchesSelectedBrands", () => {
  it('sem seleção ("Todas") aceita qualquer marca', () => {
    expect(ticketMatchesSelectedBrands(nivelTicket, [])).toBe(true);
    expect(ticketMatchesSelectedBrands(fortmaxTicket, [])).toBe(true);
  });

  it("filtro Nível não aceita ticket Fortmax", () => {
    expect(ticketMatchesSelectedBrands(nivelTicket, [NIVEL])).toBe(true);
    expect(ticketMatchesSelectedBrands(fortmaxTicket, [NIVEL])).toBe(false);
  });

  it("filtro Fortmax não aceita ticket Nível", () => {
    expect(ticketMatchesSelectedBrands(fortmaxTicket, [FORTMAX])).toBe(true);
    expect(ticketMatchesSelectedBrands(nivelTicket, [FORTMAX])).toBe(false);
  });

  it("seleção múltipla aceita as duas", () => {
    expect(ticketMatchesSelectedBrands(nivelTicket, [NIVEL, FORTMAX])).toBe(
      true
    );
    expect(ticketMatchesSelectedBrands(fortmaxTicket, [NIVEL, FORTMAX])).toBe(
      true
    );
  });

  it("ticket sem marca fica fora quando há filtro ativo", () => {
    expect(ticketMatchesSelectedBrands({ id: 3 }, [NIVEL])).toBe(false);
    // …mas aparece em "Todas", para não sumir ticket legado da tela.
    expect(ticketMatchesSelectedBrands({ id: 3 }, [])).toBe(true);
  });
});

describe("shouldShowTicketInList respeita a marca antes de tudo", () => {
  it("filtro Nível esconde Fortmax mesmo para admin", () => {
    const args = baseArgs(fortmaxTicket);
    expect(shouldShowTicketInList({ ...args, selectedBrandIds: [NIVEL] })).toBe(
      false
    );
  });

  it("filtro Nível mantém Nível", () => {
    const args = baseArgs(nivelTicket);
    expect(shouldShowTicketInList({ ...args, selectedBrandIds: [NIVEL] })).toBe(
      true
    );
  });

  it('"Todas" mostra as duas', () => {
    expect(shouldShowTicketInList(baseArgs(nivelTicket))).toBe(true);
    expect(shouldShowTicketInList(baseArgs(fortmaxTicket))).toBe(true);
  });

  it("marca combina com o filtro da aba IA sem quebrá-la", () => {
    const aiTicket = {
      ...nivelTicket,
      aiAgentId: 3,
      userId: null,
      status: "pending",
      aiHandoff: true,
      operationalState: { listColumn: "pending" }
    };

    const args = {
      ...baseArgs(aiTicket),
      status: undefined,
      supervision: true,
      listMode: "ai",
      aiFilter: "ai_supervision"
    };

    expect(shouldShowTicketInList({ ...args, selectedBrandIds: [NIVEL] })).toBe(
      true
    );
    expect(
      shouldShowTicketInList({ ...args, selectedBrandIds: [FORTMAX] })
    ).toBe(false);
  });
});
