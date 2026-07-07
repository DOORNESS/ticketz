import { Request, Response } from "express";
import { resetTestEnvironmentForCompany } from "../services/AiServices/ResetTestEnvironmentService";

export const resetEnvironment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const summary = await resetTestEnvironmentForCompany(companyId);
  return res.status(200).json({
    ok: true,
    message:
      "Ambiente limpo. Todos os tickets, mensagens e estados temporários da IA foram removidos.",
    summary
  });
};
