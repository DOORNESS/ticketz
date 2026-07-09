import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import AiAgent from "../../models/AiAgent";
import { logger } from "../../utils/logger";
import {
  classifyAiTicketState,
  logInvalidAiTicketState
} from "./AiTicketStateService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";

export const repairAiTicketStates = async (
  companyId?: number
): Promise<number> => {
  await AiAgent.update(
    { transcriptionModel: "whisper-1" },
    {
      where: {
        transcriptionModel: {
          [Op.in]: ["gpt-4o-mini-transcribe", "gpt-4o-transcribe"]
        }
      }
    }
  );

  const where: Record<string, unknown> = {
    [Op.or]: [
      {
        aiHandoff: true,
        status: "pending",
        queueId: null
      },
      {
        aiAgentId: { [Op.ne]: null },
        aiHandoff: false,
        queueId: null,
        status: { [Op.ne]: "closed" }
      }
    ]
  };

  if (companyId) {
    where.companyId = companyId;
  }

  const brokenTickets = await Ticket.findAll({ where, limit: 200 });
  let repaired = 0;

  for (let index = 0; index < brokenTickets.length; index += 1) {
    const ticket = brokenTickets[index];
    logInvalidAiTicketState(ticket, "repairAiTicketStates");

    let fallbackQueueId = ticket.queueId;

    if (!fallbackQueueId && ticket.aiAgentId) {
      const agent = await AiAgent.findByPk(ticket.aiAgentId);
      fallbackQueueId = agent?.fallbackQueueId || null;
    }

    if (!fallbackQueueId) {
      const firstQueue = await Queue.findOne({
        where: { companyId: ticket.companyId },
        order: [["id", "ASC"]]
      });
      fallbackQueueId = firstQueue?.id || null;
    }

    if (!fallbackQueueId) {
      continue;
    }

    await ticket.update({ queueId: fallbackQueueId });
    await ticket.reload({ include: ["contact", "queue", "whatsapp", "user"] });
    websocketUpdateTicket(ticket);
    repaired += 1;

    logger.warn(
      {
        ticketId: ticket.id,
        queueId: fallbackQueueId,
        state: classifyAiTicketState(ticket)
      },
      "AiTicketState:repaired"
    );
  }

  return repaired;
};

export default repairAiTicketStates;
