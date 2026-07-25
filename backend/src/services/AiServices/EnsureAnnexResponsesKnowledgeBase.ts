import { Op } from "sequelize";
import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDomain from "../../models/KnowledgeDomain";
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
    domainNames: ["nivel cashback", "fortmax", "suporte"],
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
    (await findByNameLoose(KnowledgeDomain, companyId, config.domainNames)) ||
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
    if (!base.knowledgeDomainId && domain?.id) {
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

  await Promise.all(
    targetAgents.map(async agent => {
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

export const ensureAllAnnexResponsesKnowledgeBases = async (
  companyId: number
): Promise<void> => {
  await Promise.all([
    ensureAnnexResponsesKnowledgeBase(companyId, "nivel"),
    ensureAnnexResponsesKnowledgeBase(companyId, "fortmax")
  ]);
};
