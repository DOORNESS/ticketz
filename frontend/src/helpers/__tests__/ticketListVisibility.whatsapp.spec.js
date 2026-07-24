import {
  ticketMatchesSelectedWhatsapps,
  shouldShowTicketInList
} from "../ticketListVisibility";

describe("ticketMatchesSelectedWhatsapps", () => {
  it("returns all tickets when no whatsapp filter is selected", () => {
    expect(
      ticketMatchesSelectedWhatsapps({ whatsappId: 3 }, [])
    ).toBe(true);
  });

  it("filters tickets by whatsapp line", () => {
    expect(
      ticketMatchesSelectedWhatsapps({ whatsappId: 3 }, [3])
    ).toBe(true);
    expect(
      ticketMatchesSelectedWhatsapps({ whatsappId: 3 }, [5])
    ).toBe(false);
  });
});

describe("shouldShowTicketInList whatsapp filter", () => {
  it("hides tickets from other whatsapp lines", () => {
    const ticket = {
      id: 1,
      status: "open",
      whatsappId: 2,
      queueId: 6,
      aiAgentId: 9,
      userId: null,
      aiPaused: false,
      aiHandoff: false
    };

    expect(
      shouldShowTicketInList({
        ticket,
        status: "open",
        supervision: true,
        listMode: "ai",
        selectedQueueIds: [],
        selectedWhatsappIds: [5],
        profile: "admin",
        showAll: true,
        userId: 1,
        superUser: true,
        aiFilter: "ai_supervision"
      })
    ).toBe(false);
  });
});
