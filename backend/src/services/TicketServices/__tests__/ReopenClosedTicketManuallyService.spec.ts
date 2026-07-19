import reopenClosedTicketManually from "../ReopenClosedTicketManuallyService";
import ShowTicketService from "../ShowTicketService";
import UpdateTicketService from "../UpdateTicketService";
import CheckContactOpenTickets from "../../../helpers/CheckContactOpenTickets";
import User from "../../../models/User";
import Ticket from "../../../models/Ticket";

jest.mock("../ShowTicketService");
jest.mock("../UpdateTicketService");
jest.mock("../../../helpers/CheckContactOpenTickets");

describe("ReopenClosedTicketManuallyService", () => {
  const user = {
    id: 7,
    companyId: 1,
    profile: "admin"
  } as User;

  const closedTicket = {
    id: 10,
    status: "closed",
    contactId: 3,
    whatsappId: 2,
    aiAgentId: null,
    aiHandoff: false,
    aiPaused: false,
    contact: { disableBot: false }
  } as Ticket;

  beforeEach(() => {
    jest.clearAllMocks();
    (ShowTicketService as jest.Mock).mockResolvedValue(closedTicket);
    (CheckContactOpenTickets as jest.Mock).mockResolvedValue(null);
    (UpdateTicketService as jest.Mock).mockImplementation(({ ticketData }) =>
      Promise.resolve({
        ticket: { ...closedTicket, ...ticketData, status: ticketData.status }
      })
    );
  });

  it("returns alreadyOpen when ticket is not closed", async () => {
    (ShowTicketService as jest.Mock).mockResolvedValue({
      ...closedTicket,
      status: "open"
    });

    const result = await reopenClosedTicketManually({
      ticketId: 10,
      user
    });

    expect(result.alreadyOpen).toBe(true);
    expect(UpdateTicketService).not.toHaveBeenCalled();
  });

  it("closes conflicting ticket before reopening to human", async () => {
    (CheckContactOpenTickets as jest.Mock).mockResolvedValue({ id: 99 });

    await reopenClosedTicketManually({ ticketId: 10, user });

    expect(UpdateTicketService).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 99,
        ticketData: expect.objectContaining({
          status: "closed",
          justClose: true
        })
      })
    );
    expect(UpdateTicketService).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 10,
        ticketData: expect.objectContaining({
          status: "open",
          userId: user.id
        })
      })
    );
  });

  it("reopens to AI when releaseToAi is true", async () => {
    (ShowTicketService as jest.Mock).mockResolvedValue({
      ...closedTicket,
      aiAgentId: 5
    });

    const result = await reopenClosedTicketManually({
      ticketId: 10,
      user,
      releaseToAi: true
    });

    expect(result.releasedToAi).toBe(true);
    expect(UpdateTicketService).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 10,
        ticketData: expect.objectContaining({
          status: "pending",
          userId: null,
          aiProcessingState: "ai_active"
        })
      })
    );
  });
});
