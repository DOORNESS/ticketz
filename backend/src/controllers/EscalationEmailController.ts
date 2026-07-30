import { Request, Response } from "express";
import {
  renderEscalationFormPage,
  submitEscalationResolution
} from "../services/AiServices/EscalationResolutionService";

export const showEscalationForm = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { token } = req.params;
  const html = await renderEscalationFormPage(token);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
};

export const submitEscalationForm = async (
  req: Request,
  res: Response
): Promise<Response> => {
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
};
