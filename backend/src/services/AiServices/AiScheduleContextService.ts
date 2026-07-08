import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import VerifyCurrentSchedule from "../CompanyService/VerifyCurrentSchedule";
import { OpenHoursData } from "../../helpers/checkOpenHours";

export type AiScheduleContext = {
  scheduleEnabled: boolean;
  inBusinessHours: boolean;
  officialNotice: string | null;
  scheduleSummary: string | null;
};

const DAY_LABELS: Record<string, string> = {
  mon: "segunda",
  tue: "terça",
  wed: "quarta",
  thu: "quinta",
  fri: "sexta",
  sat: "sábado",
  sun: "domingo"
};

const formatScheduleSummary = (schedule?: OpenHoursData | null): string | null => {
  if (!schedule?.weeklyRules?.length) {
    return null;
  }

  const lines = schedule.weeklyRules.flatMap(rule => {
    const days = rule.days.map(day => DAY_LABELS[day] || day).join(", ");
    const hours = rule.hours
      .map(range => `${range.from} às ${range.to}`)
      .join(" e ");
    return [`${days}: ${hours}`];
  });

  return lines.join("\n");
};

const resolveScheduleData = async (
  ticket: Ticket,
  scheduleType: string
): Promise<OpenHoursData | null> => {
  if (scheduleType === "queue" && ticket.queueId) {
    const queue =
      ticket.queue ||
      (await Queue.findByPk(ticket.queueId, { attributes: ["schedules"] }));
    return (queue?.schedules as OpenHoursData) || null;
  }

  if (scheduleType === "company" || scheduleType === "queue") {
    const Company = (await import("../../models/Company")).default;
    const company = await Company.findByPk(ticket.companyId, {
      attributes: ["schedules"]
    });
    return (company?.schedules as OpenHoursData) || null;
  }

  return null;
};

export const getAiScheduleContext = async (
  ticket: Ticket
): Promise<AiScheduleContext> => {
  const scheduleType = await GetCompanySetting(
    ticket.companyId,
    "scheduleType",
    "disabled"
  );

  if (!scheduleType || scheduleType === "disabled") {
    return {
      scheduleEnabled: false,
      inBusinessHours: true,
      officialNotice: null,
      scheduleSummary: null
    };
  }

  let inBusinessHours = true;
  let officialNotice: string | null = null;
  const scheduleData = await resolveScheduleData(ticket, scheduleType);
  const scheduleSummary = formatScheduleSummary(scheduleData);

  if (scheduleType === "company") {
    const schedule = await VerifyCurrentSchedule(ticket.companyId);
    inBusinessHours = Boolean(schedule?.inActivity);

    const whatsapp =
      ticket.whatsapp ||
      (ticket.whatsappId
        ? await Whatsapp.findByPk(ticket.whatsappId, {
            attributes: ["outOfHoursMessage"]
          })
        : null);

    officialNotice = whatsapp?.outOfHoursMessage?.trim() || null;
  } else if (scheduleType === "queue") {
    if (ticket.queueId) {
      const schedule = await VerifyCurrentSchedule(
        ticket.companyId,
        ticket.queueId
      );
      inBusinessHours = Boolean(schedule?.inActivity);

      const queue =
        ticket.queue ||
        (await Queue.findByPk(ticket.queueId, {
          attributes: ["outOfHoursMessage"]
        }));

      officialNotice = queue?.outOfHoursMessage?.trim() || null;
    } else {
      const schedule = await VerifyCurrentSchedule(ticket.companyId);
      inBusinessHours = Boolean(schedule?.inActivity);

      const whatsapp =
        ticket.whatsapp ||
        (ticket.whatsappId
          ? await Whatsapp.findByPk(ticket.whatsappId, {
              attributes: ["outOfHoursMessage"]
            })
          : null);

      officialNotice = whatsapp?.outOfHoursMessage?.trim() || null;
    }
  }

  return {
    scheduleEnabled: true,
    inBusinessHours,
    officialNotice,
    scheduleSummary
  };
};

export const buildAiSchedulePromptBlock = (
  context: AiScheduleContext
): string => {
  if (!context.scheduleEnabled) {
    return "";
  }

  const lines = ["Informações de horário de atendimento humano:"];

  if (context.scheduleSummary) {
    lines.push(
      `Horário configurado no painel (use exatamente estes horários):\n${context.scheduleSummary}`
    );
  }

  if (context.officialNotice) {
    lines.push(
      `Mensagem oficial configurada no sistema: "${context.officialNotice}"`
    );
  }

  lines.push(
    context.inBusinessHours
      ? "Situação atual: dentro do horário de atendimento humano."
      : "Situação atual: FORA do horário de atendimento humano."
  );

  if (!context.inBusinessHours) {
    lines.push(
      "Mesmo fora do horário, tente ajudar o cliente com orientações objetivas.",
      "Sempre reforce educadamente o horário oficial configurado no painel (segunda a sexta, 08:00 às 17:00, salvo exceção explícita acima).",
      "Não invente horário diferente do configurado.",
      "Não envie apenas a mensagem automática; responda de forma natural e útil ao que o cliente perguntou."
    );
  }

  return lines.join("\n");
};
