import { chatCompletion } from "./ModelGateway";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { logger } from "../../utils/logger";

const SUMMARY_PROMPT = `Você resume atendimentos para handoff humano.
Gere um resumo curto (máximo 6 linhas) em português do Brasil.
Formato:
Resumo
- ponto 1
- ponto 2
Inclua motivo da transferência quando informado.
Seja objetivo. Tempo de leitura inferior a 10 segundos.`;

export const generateHandoffSummary = async ({
  ticket,
  conversationText,
  handoffReasonLabel
}: {
  ticket: Ticket;
  conversationText?: string;
  handoffReasonLabel?: string | null;
}): Promise<string> => {
  try {
    const history = await Message.findAll({
      where: { ticketId: ticket.id },
      order: [["createdAt", "ASC"]],
      limit: 20
    });

    const transcript = history
      .map(msg => `${msg.fromMe ? "Atendente/IA" : "Cliente"}: ${msg.body}`)
      .join("\n");

    const completion = await chatCompletion(ticket.companyId, {
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 300,
      messages: [
        { role: "system", content: SUMMARY_PROMPT },
        {
          role: "user",
          content: [
            `Motivo do handoff: ${handoffReasonLabel || "não informado"}`,
            `Conversa:\n${conversationText || transcript}`
          ].join("\n\n")
        }
      ]
    });

    const summary = completion.content?.trim();
    if (summary) {
      return summary;
    }
  } catch (error) {
    logger.warn(
      { error, ticketId: ticket.id },
      "generateHandoffSummary failed"
    );
  }

  return [
    "Resumo",
    "- Atendimento iniciado pela IA.",
    handoffReasonLabel
      ? `- Transferido: ${handoffReasonLabel}.`
      : "- Transferido para atendimento humano.",
    "- Revise o histórico completo antes de responder."
  ].join("\n");
};
