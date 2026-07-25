import { Op } from "sequelize";
import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDomain from "../../models/KnowledgeDomain";
import {
  syncAgentKnowledgeBases,
  listAgentKnowledgeBaseIds
} from "./AiAgentKnowledgeBaseService";
import { findByNameLoose } from "./WireSupportLinesService";

export const ANNEX_RESPONSES_BASE_NAME = "Respostas anexas";
export const ANNEX_RESPONSES_BASE_SLUG = "respostas-anexas";

export const ensureAnnexResponsesKnowledgeBase = async (
  companyId: number
): Promise<KnowledgeBase> => {
  const domain =
    (await findByNameLoose(KnowledgeDomain, companyId, [
      "nivel cashback",
      "fortmax",
      "suporte"
    ])) ||
    (await KnowledgeDomain.findOne({
      where: { companyId, active: true },
      order: [["sortOrder", "ASC"]]
    }));

  let base = await KnowledgeBase.findOne({
    where: {
      companyId,
      [Op.or]: [
        { name: { [Op.iLike]: ANNEX_RESPONSES_BASE_NAME } },
        { slug: ANNEX_RESPONSES_BASE_SLUG }
      ]
    }
  });

  if (!base) {
    base = await KnowledgeBase.create({
      companyId,
      name: ANNEX_RESPONSES_BASE_NAME,
      slug: ANNEX_RESPONSES_BASE_SLUG,
      description:
        "Respostas validadas por humanos durante supervisão da IA — anexadas manualmente.",
      knowledgeDomainId: domain?.id || null,
      active: true
    });
  } else if (!base.active) {
    await base.update({ active: true });
  }

  const agents = await AiAgent.findAll({
    where: {
      companyId,
      active: true,
      role: { [Op.in]: ["legacy", "specialist"] }
    }
  });

  await Promise.all(
    agents.map(async agent => {
      const linkedIds = await listAgentKnowledgeBaseIds(companyId, agent.id);
      if (linkedIds.includes(base.id)) {
        return;
      }
      await syncAgentKnowledgeBases({
        companyId,
        aiAgentId: agent.id,
        knowledgeBaseIds: [...linkedIds, base.id]
      });
    })
  );

  return base;
};
