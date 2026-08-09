import { Op } from "sequelize";
import KnowledgeAssetVersion from "../../../models/KnowledgeAssetVersion";
import { logger } from "../../../utils/logger";

/**
 * Destrava versões que ficaram presas em `processing`.
 *
 * A indexação marca a versão como `processing` e devolve o controle; quem
 * finaliza é o worker. Se o backend reinicia no meio — deploy, queda, restart
 * do watchdog — o job some e a versão fica `processing` para sempre. E o
 * estado é pior do que uma falha: `KnowledgePublishService` trata
 * `processing` enfileirando um swap que ESPERA a indexação terminar, então
 * publicar também não resolve. Deadlock silencioso.
 *
 * Em produção isso deixou o ativo "Nível Empreesas" em "Processando" por onze
 * dias, sem erro nenhum registrado e sem forma de sair do estado pela tela.
 *
 * Marcar como `failed` devolve o caso ao fluxo normal: a tela mostra erro de
 * verdade e publicar reenfileira a indexação (`["pending","failed"]`).
 *
 * O corte por tempo evita matar indexação legítima em andamento — nenhuma
 * demora meia hora; as que demoram minutos já terminaram muito antes.
 */
const STALLED_AFTER_MINUTES = Number(
  process.env.KNOWLEDGE_INGESTION_STALL_MINUTES || 30
);

export const recoverStalledIngestions = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - STALLED_AFTER_MINUTES * 60 * 1000);

  const stalled = await KnowledgeAssetVersion.findAll({
    where: {
      ingestionStatus: "processing",
      updatedAt: { [Op.lt]: cutoff }
    },
    attributes: ["id", "companyId", "knowledgeAssetId", "updatedAt"]
  });

  if (!stalled.length) {
    return 0;
  }

  await KnowledgeAssetVersion.update(
    {
      ingestionStatus: "failed",
      errorMessage:
        "Indexação interrompida (provavelmente reinício do servidor). " +
        "Publique novamente para reprocessar."
    } as never,
    { where: { id: { [Op.in]: stalled.map(version => version.id) } } }
  );

  logger.warn(
    {
      recovered: stalled.length,
      versionIds: stalled.map(version => version.id),
      stalledAfterMinutes: STALLED_AFTER_MINUTES
    },
    "Versões presas em processing foram marcadas como failed e podem ser reprocessadas"
  );

  return stalled.length;
};

export default recoverStalledIngestions;
