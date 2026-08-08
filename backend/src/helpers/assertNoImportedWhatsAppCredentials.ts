import { Op } from "sequelize";
import Whatsapp from "../models/Whatsapp";
import BaileysKeys from "../models/BaileysKeys";
import { logger } from "../utils/logger";

/**
 * Impede que um ambiente não-produtivo suba com credenciais WhatsApp de
 * produção.
 *
 * O cenário que isto existe para barrar: alguém restaura um dump de produção
 * em homologação para ter dados realistas. O dump traz `Whatsapps` e
 * `BaileysKeys` junto, e no primeiro start a homologação reconecta os números
 * reais — passando a responder clientes de verdade a partir de um ambiente de
 * teste. Nenhuma outra barreira desta entrega pega isso: banco separado, Redis
 * separado e bucket separado não impedem que os dados sejam copiados para
 * dentro do ambiente isolado.
 *
 * Ativo apenas quando `ENVIRONMENT_NAME` está definido e é diferente de
 * `production` — produção nunca passa por esta verificação.
 *
 * Liberação consciente: `ALLOW_IMPORTED_WHATSAPP=1`. É deliberadamente uma
 * variável de ambiente separada, e não um flag no dump, para que ligar isso
 * seja uma decisão explícita de quem opera o ambiente.
 */

const isGuardedEnvironment = (): boolean => {
  const name = (process.env.ENVIRONMENT_NAME || "").trim().toLowerCase();
  return Boolean(name) && name !== "production" && name !== "prod";
};

const isExplicitlyAllowed = (): boolean =>
  ["1", "true", "yes"].includes(
    (process.env.ALLOW_IMPORTED_WHATSAPP || "").trim().toLowerCase()
  );

export type ImportedCredentialsReport = {
  environment: string;
  connectionsWithSession: { id: number; name: string }[];
  baileysKeyCount: number;
};

export const findImportedWhatsAppCredentials =
  async (): Promise<ImportedCredentialsReport> => {
    const connections = await Whatsapp.findAll({
      where: {
        [Op.or]: [
          { session: { [Op.ne]: null } },
          { status: { [Op.in]: ["CONNECTED", "PAIRING", "OPENING"] } }
        ]
      },
      attributes: ["id", "name"]
    });

    const baileysKeyCount = await BaileysKeys.count();

    return {
      environment: (process.env.ENVIRONMENT_NAME || "").trim(),
      connectionsWithSession: connections.map(item => ({
        id: item.id,
        name: item.name
      })),
      baileysKeyCount
    };
  };

/**
 * Lança quando encontra credenciais importadas sem autorização explícita.
 * O chamador decide se aborta o processo — aqui só se detecta e relata.
 */
export const assertNoImportedWhatsAppCredentials = async (): Promise<void> => {
  if (!isGuardedEnvironment()) {
    return;
  }

  const report = await findImportedWhatsAppCredentials();
  const hasCredentials =
    report.connectionsWithSession.length > 0 || report.baileysKeyCount > 0;

  if (!hasCredentials) {
    logger.info(
      { environment: report.environment },
      "Nenhuma credencial WhatsApp importada — ambiente limpo"
    );
    return;
  }

  if (isExplicitlyAllowed()) {
    logger.warn(
      { ...report, allowImportedWhatsApp: true },
      "Credenciais WhatsApp importadas detectadas e LIBERADAS por ALLOW_IMPORTED_WHATSAPP"
    );
    return;
  }

  logger.error(
    report,
    "Credenciais WhatsApp importadas detectadas em ambiente não-produtivo"
  );

  throw new Error(
    [
      `Ambiente '${report.environment}' contém credenciais WhatsApp que parecem importadas de produção:`,
      `  conexões com sessão: ${
        report.connectionsWithSession
          .map(item => `#${item.id} ${item.name}`)
          .join(", ") || "nenhuma"
      }`,
      `  registros em BaileysKeys: ${report.baileysKeyCount}`,
      "",
      "Subir assim faria este ambiente reconectar números reais.",
      "Limpe antes de iniciar:",
      '  DELETE FROM "BaileysKeys";',
      "  UPDATE \"Whatsapps\" SET session = NULL, status = 'DISCONNECTED';",
      "",
      "Se a importação for intencional e os números NÃO forem reais, defina",
      "ALLOW_IMPORTED_WHATSAPP=1 no .env do ambiente."
    ].join("\n")
  );
};

export default assertNoImportedWhatsAppCredentials;
