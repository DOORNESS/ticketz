import { Op } from "sequelize";
import AiAgentQueue from "../../models/AiAgentQueue";

export type AgentQueueLinkInput = {
  queueId: number;
  knowledgeBaseId?: number | null;
};

export const syncExclusiveAgentQueueLinks = async ({
  companyId,
  aiAgentId,
  queueLinks
}: {
  companyId: number;
  aiAgentId: number;
  queueLinks: AgentQueueLinkInput[];
}): Promise<void> => {
  const normalized = queueLinks
    .filter(link => link?.queueId)
    .map(link => ({
      queueId: Number(link.queueId),
      knowledgeBaseId: link.knowledgeBaseId
        ? Number(link.knowledgeBaseId)
        : null
    }));

  if (!normalized.length) {
    await AiAgentQueue.destroy({
      where: { companyId, aiAgentId }
    });
    return;
  }

  const queueIds = normalized.map(link => link.queueId);

  await Promise.all([
    AiAgentQueue.destroy({
      where: {
        companyId,
        aiAgentId,
        queueId: { [Op.notIn]: queueIds }
      }
    }),
    AiAgentQueue.destroy({
      where: {
        companyId,
        queueId: { [Op.in]: queueIds },
        aiAgentId: { [Op.ne]: aiAgentId }
      }
    })
  ]);

  await Promise.all(
    normalized.map(async link => {
      const existing = await AiAgentQueue.findOne({
        where: { companyId, aiAgentId, queueId: link.queueId }
      });

      if (existing) {
        await existing.update({ knowledgeBaseId: link.knowledgeBaseId });
        return;
      }

      await AiAgentQueue.create({
        companyId,
        aiAgentId,
        queueId: link.queueId,
        knowledgeBaseId: link.knowledgeBaseId
      });
    })
  );
};
