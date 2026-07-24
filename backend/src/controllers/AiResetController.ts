import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { resetTestEnvironmentForCompany } from "../services/AiServices/ResetTestEnvironmentService";
import { assertMasterAdmin } from "../helpers/isMasterAdmin";
import { logger } from "../utils/logger";

export const resetEnvironment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const wipeContacts = req.body?.wipeContacts === true;

  if (wipeContacts) {
    await assertMasterAdmin(req.user.id);
  }

  const summary = await resetTestEnvironmentForCompany(companyId, {
    wipeContacts
  });

  return res.status(200).json({
    ok: true,
    message: wipeContacts
      ? "Base de clientes e tickets zerados. Próximo contato entrará como novo."
      : "Ambiente limpo. Todos os tickets, mensagens e estados temporários da IA foram removidos.",
    summary
  });
};

export const wipeCustomerBase = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;

  try {
    await assertMasterAdmin(req.user.id);

    const summary = await resetTestEnvironmentForCompany(companyId, {
      wipeContacts: true
    });

    return res.status(200).json({
      ok: true,
      message:
        "Base de clientes e tickets zerados. Próximo contato entrará como novo.",
      summary
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    logger.error({ error, companyId }, "Failed to wipe customer base");
    throw new AppError("ERR_WIPE_CUSTOMER_BASE_FAILED", 500);
  }
};
