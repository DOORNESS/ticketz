import Ticket from "../../models/Ticket";
import {
  canAiEngageTicket,
  isAiHandlingTicket
} from "../AiServices/AiHelpers";
import { isHandoffPendingTicketState } from "../../helpers/assertCanAcceptTicket";

export type TicketOwnerType = "ai" | "human" | "queue" | "closed";

export type TicketOperationalState = {
  ownerType: TicketOwnerType;
  label: string;
  listColumn: "ai" | "pending" | "open" | "closed" | "none";
  canAiRespond: boolean;
  isAiActive: boolean;
  isHandoffPending: boolean;
  isHumanHandling: boolean;
  allowedActions: {
    assume: boolean;
    accept: boolean;
    releaseToAi: boolean;
    reopen: boolean;
  };
  blockReason?: string | null;
};

export const buildTicketOperationalState = (
  ticket: Ticket,
  viewerUserId?: number
): TicketOperationalState => {
  if (ticket.status === "closed") {
    return {
      ownerType: "closed",
      label: "Fechado",
      listColumn: "closed",
      canAiRespond: false,
      isAiActive: false,
      isHandoffPending: false,
      isHumanHandling: false,
      allowedActions: {
        assume: false,
        accept: false,
        releaseToAi: false,
        reopen: true
      }
    };
  }

  const aiActive = isAiHandlingTicket(ticket);
  const handoffPending = isHandoffPendingTicketState(ticket);
  const humanHandling =
    !!ticket.userId &&
    (ticket.status === "open" || ticket.status === "pending");
  const viewerIsOwner =
    !!viewerUserId && Number(ticket.userId) === Number(viewerUserId);

  if (humanHandling) {
    return {
      ownerType: "human",
      label: ticket.user?.name
        ? `Em atendimento — ${ticket.user.name}`
        : "Em atendimento humano",
      listColumn: "open",
      canAiRespond: false,
      isAiActive: false,
      isHandoffPending: false,
      isHumanHandling: true,
      allowedActions: {
        assume: false,
        accept: false,
        releaseToAi: Boolean(
          viewerIsOwner &&
            (ticket.aiAgentId || ticket.aiStartedAt || ticket.aiHandoff)
        ),
        reopen: false
      }
    };
  }

  if (aiActive) {
    return {
      ownerType: "ai",
      label: "Atendido pela IA",
      listColumn: "ai",
      canAiRespond: canAiEngageTicket(ticket),
      isAiActive: true,
      isHandoffPending: false,
      isHumanHandling: false,
      allowedActions: {
        assume: true,
        accept: false,
        releaseToAi: false,
        reopen: false
      },
      blockReason: ticket.aiPaused ? "IA pausada" : null
    };
  }

  if (handoffPending) {
    return {
      ownerType: "queue",
      label: "Aguardando atendente",
      listColumn: "pending",
      canAiRespond: false,
      isAiActive: false,
      isHandoffPending: true,
      isHumanHandling: false,
      allowedActions: {
        assume: true,
        accept: true,
        releaseToAi: false,
        reopen: false
      }
    };
  }

  if (ticket.status === "pending") {
    return {
      ownerType: "queue",
      label: "Aguardando na fila",
      listColumn: "pending",
      canAiRespond: false,
      isAiActive: false,
      isHandoffPending: false,
      isHumanHandling: false,
      allowedActions: {
        assume: false,
        accept: true,
        releaseToAi: false,
        reopen: false
      },
      blockReason: !ticket.queueId
        ? "Sem fila — apenas administrador pode aceitar"
        : null
    };
  }

  return {
    ownerType: "queue",
    label: "Aberto",
    listColumn: "open",
    canAiRespond: false,
    isAiActive: false,
    isHandoffPending: false,
    isHumanHandling: false,
    allowedActions: {
      assume: false,
      accept: false,
      releaseToAi: false,
      reopen: false
    }
  };
};

export const serializeTicketWithOperationalState = (
  ticket: Ticket,
  viewerUserId?: number
): Record<string, unknown> => {
  const plain = ticket.get
    ? (ticket.get({ plain: true }) as unknown as Record<string, unknown>)
    : ({ ...(ticket as unknown as Record<string, unknown>) });

  return {
    ...plain,
    operationalState: buildTicketOperationalState(ticket, viewerUserId)
  };
};
