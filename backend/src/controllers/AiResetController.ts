import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { resetTestEnvironmentForCompany } from "../services/AiServices/ResetTestEnvironmentService";
import { wireSupportLinesForCompany } from "../services/AiServices/WireSupportLinesService";
import { reengageStuckAiTicketsForCompany } from "../services/AiServices/ReengageStuckAiTicketsService";
import { assertMasterAdmin } from "../helpers/isMasterAdmin";
import { logger } from "../utils/logger";

const extractDbError = (
  error: unknown
): {
  message: string;
  code?: string;
  constraint?: string;
  detail?: string;
} => {
  const parent = (
    error as {
      parent?: { code?: string; constraint?: string; detail?: string };
    }
  )?.parent;

  return {
    message: error instanceof Error ? error.message : String(error),
    code: parent?.code,
    constraint: parent?.constraint,
    detail: parent?.detail
  };
};

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

    logger.error(
      { companyId, dbError: extractDbError(error), error },
      "Failed to wipe customer base"
    );
    throw new AppError("ERR_WIPE_CUSTOMER_BASE_FAILED", 500);
  }
};

export const wireSupportLines = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;

  const wiring = await wireSupportLinesForCompany(companyId);
  const reengage = await reengageStuckAiTicketsForCompany(companyId);

  return res.status(200).json({
    ok: wiring.ok || Boolean(wiring.nivel || wiring.fortmax),
    message: wiring.ok
      ? "Linhas Fortmax e Nível ligadas ao Nivelton/Webin, filas e bases de conhecimento."
      : "Ligação parcial — veja erros e tente reconectar WhatsApp/filas ausentes.",
    wiring,
    reengage
  });
};
