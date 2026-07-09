import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import { getIO } from "../../libs/socket";
import { logAiOperationalEvent } from "./AiOperationalLogService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";

const DEFAULT_QUEUE_SLA: Record<string, number> = {
  suporte: 30,
  financeiro: 60,
  comercial: 120,
  gerencia: 300,
  gerência: 300
};

const resolveQueueSlaSeconds = (queue?: Queue | null): number | null => {
  if (!queue) {
    return null;
  }

  if (queue.slaSeconds && queue.slaSeconds > 0) {
    return queue.slaSeconds;
  }

  const normalizedName = queue.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const queueKeys = Object.keys(DEFAULT_QUEUE_SLA);
  for (let i = 0; i < queueKeys.length; i += 1) {
    const key = queueKeys[i];
    if (normalizedName.includes(key)) {
      return DEFAULT_QUEUE_SLA[key];
    }
  }

  return 120;
};

export const monitorHandoffSla = async (): Promise<void> => {
  const pendingHandoffs = await Ticket.findAll({
    where: {
      aiHandoff: true,
      status: "pending",
      userId: null,
      aiWaitingSince: { [Op.ne]: null }
    },
    include: [{ model: Queue, as: "queue" }]
  });

  const io = getIO();

  for (let i = 0; i < pendingHandoffs.length; i += 1) {
    const ticket = pendingHandoffs[i];
    const slaSeconds = resolveQueueSlaSeconds(ticket.queue);
    if (!slaSeconds) {
      continue;
    }

    const waitingMs = Date.now() - new Date(ticket.aiWaitingSince).getTime();
    const breached = waitingMs > slaSeconds * 1000;

    if (!breached || ticket.aiSlaBreached) {
      continue;
    }

    await ticket.update({ aiSlaBreached: true });

    await logAiOperationalEvent({
      companyId: ticket.companyId,
      ticketId: ticket.id,
      event: "sla_breached",
      details: {
        queueId: ticket.queueId,
        queueName: ticket.queue?.name,
        waitingMs,
        slaSeconds
      }
    });

    websocketUpdateTicket(ticket);

    if (ticket.queueId) {
      io.to(`queue-${ticket.queueId}-handoff`)
        .to(`queue-${ticket.queueId}-notification`)
        .to(`company-${ticket.companyId}-handoff`)
        .emit(`company-${ticket.companyId}-handoff`, {
          action: "sla_breached",
          ticket
        });
    }
  }
};
