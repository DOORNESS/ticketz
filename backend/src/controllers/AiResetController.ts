import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { resetTestEnvironmentForCompany } from "../services/AiServices/ResetTestEnvironmentService";
import { wireSupportLinesForCompany } from "../services/AiServices/WireSupportLinesService";
import { auditSupportLinesForCompany } from "../services/AiServices/AuditSupportLinesService";
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
  const audit = wiring.audit || (await auditSupportLinesForCompany(companyId));

  return res.status(200).json({
    ok: wiring.ok && audit.ok,
    message: wiring.ok && audit.ok
      ? "Linhas Fortmax e Nível ligadas e auditadas (WhatsApp → fila → agente → domínio → bases)."
      : "Ligação ou auditoria incompleta — veja wiring/audit e corrija itens com erro.",
    wiring,
    audit,
    reengage
  });
};

export const auditSupportLines = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  await assertMasterAdmin(req.user.id);

  const audit = await auditSupportLinesForCompany(companyId);

  return res.status(200).json({
    ok: audit.ok,
    audit
  });
};
