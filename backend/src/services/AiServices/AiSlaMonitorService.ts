import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import { getIO } from "../../libs/socket";
import { logAiOperationalEvent } from "./AiOperationalLogService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";

const FIRST_REMINDER_MS = 30 * 1000;
const SECOND_REMINDER_MS = 60 * 1000;

const resolveSupervisorEscalationMs = (queue?: Queue | null): number => {
  if (
    queue?.slaSupervisorEscalationSeconds &&
    queue.slaSupervisorEscalationSeconds > 0
  ) {
    return queue.slaSupervisorEscalationSeconds * 1000;
  }

  if (queue?.slaSeconds && queue.slaSeconds > 0) {
    return queue.slaSeconds * 1000;
  }

  return 300 * 1000;
};

const emitSlaEvent = (
  ticket: Ticket,
  action: string,
  details: Record<string, unknown>
): void => {
  const io = getIO();

  if (ticket.queueId) {
    io.to(`queue-${ticket.queueId}-handoff`)
      .to(`queue-${ticket.queueId}-notification`)
      .to(`company-${ticket.companyId}-handoff`)
      .emit(`company-${ticket.companyId}-handoff`, {
        action,
        ticket,
        ...details
      });
  }
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

  for (let i = 0; i < pendingHandoffs.length; i += 1) {
    const ticket = pendingHandoffs[i];
    const waitingMs = Date.now() - new Date(ticket.aiWaitingSince).getTime();
    const supervisorMs = resolveSupervisorEscalationMs(ticket.queue);
    let nextLevel = ticket.aiSlaEscalationLevel || 0;

    if (waitingMs >= supervisorMs && nextLevel < 3) {
      nextLevel = 3;
    } else if (waitingMs >= SECOND_REMINDER_MS && nextLevel < 2) {
      nextLevel = 2;
    } else if (waitingMs >= FIRST_REMINDER_MS && nextLevel < 1) {
      nextLevel = 1;
    }

    if (nextLevel <= (ticket.aiSlaEscalationLevel || 0)) {
      continue;
    }

    const now = new Date();
    const updatePayload: Record<string, unknown> = {
      aiSlaEscalationLevel: nextLevel,
      aiLastSlaAlertAt: now
    };

    if (nextLevel >= 3) {
      updatePayload.aiSlaBreached = true;
    }

    await ticket.update(updatePayload);

    const eventName =
      nextLevel === 1
        ? "sla_reminder_30s"
        : nextLevel === 2
          ? "sla_reminder_60s"
          : "sla_supervisor_escalation";

    await logAiOperationalEvent({
      companyId: ticket.companyId,
      ticketId: ticket.id,
      event: eventName,
      details: {
        queueId: ticket.queueId,
        queueName: ticket.queue?.name,
        waitingMs,
        escalationLevel: nextLevel,
        supervisorMs
      }
    });

    websocketUpdateTicket(ticket);

    emitSlaEvent(ticket, eventName, {
      waitingMs,
      escalationLevel: nextLevel,
      queueName: ticket.queue?.name
    });

    if (nextLevel === 1) {
      emitSlaEvent(ticket, "handoff_alert", {
        reason: "sla_reminder",
        waitingMs
      });
    }
  }
};
