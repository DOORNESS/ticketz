import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import Ticket from "../../models/Ticket";

jest.mock("../../models/Ticket");

describe("CheckContactOpenTickets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("ignores the current ticket when excludeTicketId is provided", async () => {
    (Ticket.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      CheckContactOpenTickets(10, 5, false, 99)
    ).resolves.toBeNull();

    expect(Ticket.findOne).toHaveBeenCalledTimes(1);
    const where = (Ticket.findOne as jest.Mock).mock.calls[0][0].where;
    expect(where.contactId).toBe(10);
    expect(where.whatsappId).toBe(5);
    expect(where.id).toBeDefined();
  });
});
