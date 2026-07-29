import { Op } from "sequelize";
import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeCategory from "../../models/KnowledgeCategory";
import KnowledgeDomain from "../../models/KnowledgeDomain";
import KnowledgeAsset from "../../models/KnowledgeAsset";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import {
  syncAgentKnowledgeBases,
  listAgentKnowledgeBaseIds
} from "./AiAgentKnowledgeBaseService";
import { findByNameLoose } from "./WireSupportLinesService";

export const ANNEX_RESPONSES_BASE_NAME = "Respostas anexas";

export type AnnexResponsesBrand = "nivel" | "fortmax" | "default";

const BRAND_CONFIG: Record<
  AnnexResponsesBrand,
  {
    slug: string;
    domainNames: string[];
    agentNames: string[];
  }
> = {
  nivel: {
    slug: "respostas-anexas-nivel",
    domainNames: ["nivel cashback", "nível cashback"],
    agentNames: ["nivelton", "agente nivel cashback"]
  },
  fortmax: {
    slug: "respostas-anexas-fortmax",
    domainNames: ["fortmax", "suporte fortmax"],
    agentNames: ["webin fortmax", "webin", "atendimento geral fortmax"]
  },
  default: {
    slug: "respostas-anexas",
    domainNames: [],
    agentNames: []
  }
};

export const resolveAnnexResponsesBrand = async (
  companyId: number,
  ticketId?: number
): Promise<AnnexResponsesBrand> => {
  if (!ticketId) {
    return "default";
  }

  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId },
    include: [{ model: Whatsapp, as: "whatsapp", attributes: ["id", "name"] }]
  });

  if (!ticket) {
    return "default";
  }

  const whatsappName = (ticket.whatsapp?.name || "").toLowerCase();
  if (whatsappName.includes("nivel") || whatsappName.includes("nível")) {
    return "nivel";
  }
  if (whatsappName.includes("fortmax") || whatsappName.includes("webin")) {
    return "fortmax";
  }

  if (ticket.aiAgentId) {
    const agent = await AiAgent.findOne({
      where: { id: ticket.aiAgentId, companyId },
      attributes: ["id", "name"]
    });
    const agentName = (agent?.name || "").toLowerCase();
    if (agentName.includes("nivelton") || agentName.includes("nivel")) {
      return "nivel";
    }
    if (agentName.includes("webin") || agentName.includes("fortmax")) {
      return "fortmax";
    }
  }

  return "default";
};

export const ensureAnnexResponsesKnowledgeBase = async (
  companyId: number,
  brand: AnnexResponsesBrand = "default"
): Promise<KnowledgeBase> => {
  const config = BRAND_CONFIG[brand];

  const domain =
    brand === "default"
      ? null
      : (await findByNameLoose(
          KnowledgeDomain,
          companyId,
          config.domainNames
        )) ||
        (await KnowledgeDomain.findOne({
          where: { companyId, active: true },
          order: [["sortOrder", "ASC"]]
        }));

  let base = await KnowledgeBase.findOne({
    where: {
      companyId,
      slug: config.slug
    }
  });

  if (!base) {
    base = await KnowledgeBase.create({
      companyId,
      name: ANNEX_RESPONSES_BASE_NAME,
      slug: config.slug,
      description:
        "Respostas validadas por humanos durante supervisão da IA — anexadas manualmente.",
      knowledgeDomainId: domain?.id || null,
      active: true
    });
  } else {
    const updates: Partial<KnowledgeBase> = {};
    if (!base.active) {
      updates.active = true;
    }
    if (brand === "default" && base.knowledgeDomainId) {
      updates.knowledgeDomainId = null;
    } else if (!base.knowledgeDomainId && domain?.id) {
      updates.knowledgeDomainId = domain.id;
    }
    if (base.slug !== config.slug) {
      updates.slug = config.slug;
    }
    if (Object.keys(updates).length) {
      await base.update(updates);
    }
  }

  const agentFilter =
    config.agentNames.length > 0
      ? {
          companyId,
          active: true,
          role: { [Op.in]: ["legacy", "specialist"] as string[] }
        }
      : {
          companyId,
          active: true,
          role: { [Op.in]: ["legacy", "specialist"] as string[] }
        };

  const agents = await AiAgent.findAll({ where: agentFilter });

  const targetAgents =
    config.agentNames.length > 0
      ? agents.filter(agent => {
          const name = agent.name.toLowerCase();
          return config.agentNames.some(token => name.includes(token));
        })
      : agents;

  const legacyBases =
    brand === "default"
      ? await KnowledgeBase.findAll({
          where: {
            companyId,
            slug: {
              [Op.in]: [
                BRAND_CONFIG.nivel.slug,
                BRAND_CONFIG.fortmax.slug
              ]
            }
          },
          attributes: ["id"]
        })
      : [];
  const legacyBaseIds = legacyBases.map(item => item.id);
  const cumulativeAsset =
    brand === "default"
      ? await KnowledgeAsset.findOne({
          where: {
            companyId,
            knowledgeBaseId: base.id,
            slug: "historico-respostas-validadas"
          },
          attributes: ["id"]
        })
      : null;
  const canConsolidateLegacy = Boolean(cumulativeAsset);

  await Promise.all(
    targetAgents.map(async agent => {
      const linkedIds = await listAgentKnowledgeBaseIds(companyId, agent.id);
      const consolidatedIds = canConsolidateLegacy
        ? linkedIds.filter(id => !legacyBaseIds.includes(id))
        : linkedIds;
      if (
        consolidatedIds.includes(base.id) &&
        consolidatedIds.length === linkedIds.length
      ) {
        return;
      }
      await syncAgentKnowledgeBases({
        companyId,
        aiAgentId: agent.id,
        knowledgeBaseIds: Array.from(new Set([...consolidatedIds, base.id]))
      });
    })
  );

  if (legacyBaseIds.length && canConsolidateLegacy) {
    await KnowledgeBase.update(
      { active: false },
      { where: { companyId, id: { [Op.in]: legacyBaseIds } } }
    );
  }

  return base;
};

const ANNEX_CATEGORY_SLUG = "respostas-supervisionadas";

export const ensureAnnexCategoryId = async (
  companyId: number,
  knowledgeBaseId: number
): Promise<number> => {
  let category = await KnowledgeCategory.findOne({
    where: {
      companyId,
      knowledgeBaseId,
      slug: ANNEX_CATEGORY_SLUG
    }
  });

  if (!category) {
    category = await KnowledgeCategory.create({
      companyId,
      knowledgeBaseId,
      name: "Respostas supervisionadas",
      slug: ANNEX_CATEGORY_SLUG,
      description:
        "Respostas sugeridas por humanos e anexadas durante supervisão da IA.",
      sortOrder: 0,
      depth: 0,
      pathIds: []
    });
  }

  return category.id;
};

export const ensureAllAnnexResponsesKnowledgeBases = async (
  companyId: number
): Promise<void> => {
  await ensureAnnexResponsesKnowledgeBase(companyId, "default");
};
