import { Request, Response } from "express";
import {
  renderEscalationFormPage,
  submitEscalationResolution
} from "../services/AiServices/EscalationResolutionService";
import { buildEscalationErrorPageHtml } from "../services/AiServices/EscalationTranscriptService";
import { logger } from "../utils/logger";

const sendEscalationErrorPage = (res: Response, message: string): Response => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.status(500).send(buildEscalationErrorPageHtml(message));
};

export const showEscalationForm = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { token } = req.params;
    const html = await renderEscalationFormPage(token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    logger.error({ error }, "Escalation form rendering failed");
    return sendEscalationErrorPage(
      res,
      "Não foi possível abrir o formulário agora. Tente novamente em instantes."
    );
  }
};

export const submitEscalationForm = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { token } = req.params;
    const humanGuidance =
      typeof req.body?.humanGuidance === "string" ? req.body.humanGuidance : "";
    const resolvedByEmail =
      typeof req.body?.resolvedByEmail === "string"
        ? req.body.resolvedByEmail
        : "";

    const html = await submitEscalationResolution({
      token,
      humanGuidance,
      resolvedByEmail
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    logger.error({ error }, "Escalation form submission failed");
    return sendEscalationErrorPage(
      res,
      "Não foi possível concluir o aviso ao cliente agora. Volte ao formulário e tente novamente em instantes."
    );
  }
};
