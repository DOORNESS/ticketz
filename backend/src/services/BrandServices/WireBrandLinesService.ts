import Brand from "../../models/Brand";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import { syncAgentKnowledgeBases } from "../AiServices/AiAgentKnowledgeBaseService";
import { syncExclusiveAgentQueueLinks } from "../AiServices/syncExclusiveAgentQueueLinks";
import AssociateWhatsappQueue from "../WhatsappService/AssociateWhatsappQueue";
import { logger } from "../../utils/logger";

/**
 * Religamento das linhas de atendimento, orientado por Brand.
 *
 * Substitui `wireNivelLine` / `wireFortmaxLine`, que eram duas funções
 * escritas à mão e localizavam os registros por substring no nome. Aqui a
 * marca já sabe quem são seus registros — o vínculo é FK — e o religamento é
 * um laço sobre as marcas ativas.
 *
 * Consequência prática: criar a Brand 3 e vincular conexão, fila, agente e
 * bases pela interface é suficiente. Não existe `wireBrand3Line` para
 * escrever.
 *
 * Só religa o que está estruturalmente vinculado. Marca incompleta é
 * reportada, nunca adivinhada.
 */

export type WiredBrandLine = {
  brandId: number;
  slug: string;
  name: string;
  whatsapps: { id: number; name: string }[];
  queues: { id: number; name: string }[];
  agent: { id: number; name: string } | null;
  knowledgeBases: number[];
  issues: string[];
};

export type WireBrandLinesSummary = {
  companyId: number;
  ok: boolean;
  lines: WiredBrandLine[];
};

const wireSingleBrand = async (
  companyId: number,
  brand: Brand
): Promise<WiredBrandLine> => {
  const issues: string[] = [];

  const [whatsapps, queues, agents, bases] = await Promise.all([
    Whatsapp.findAll({
      where: { companyId, brandId: brand.id },
      attributes: ["id", "name"]
    }),
    Queue.findAll({
      where: { companyId, brandId: brand.id },
      attributes: ["id", "name"]
    }),
    AiAgent.findAll({
      where: { companyId, brandId: brand.id, active: true },
      order: [["id", "ASC"]]
    }),
    KnowledgeBase.findAll({
      where: { companyId, brandId: brand.id, active: true },
      attributes: ["id"]
    })
  ]);

  if (!whatsapps.length) {
    issues.push("sem conexão de WhatsApp vinculada");
  }
  if (!queues.length) {
    issues.push("sem fila vinculada");
  }
  if (!agents.length) {
    issues.push("sem agente de IA ativo vinculado");
  }
  if (!bases.length) {
    issues.push("sem base de conhecimento vinculada");
  }

  const agent = agents[0] || null;
  const knowledgeBaseIds = bases.map(base => base.id);

  if (agent && knowledgeBaseIds.length) {
    await syncAgentKnowledgeBases({
      companyId,
      aiAgentId: agent.id,
      knowledgeBaseIds
    });
  }

  if (agent && queues.length) {
    await syncExclusiveAgentQueueLinks({
      companyId,
      aiAgentId: agent.id,
      queueLinks: queues.map(queue => ({
        queueId: queue.id,
        knowledgeBaseId: knowledgeBaseIds[0] || null
      }))
    });
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const whatsapp of whatsapps) {
    if (queues.length) {
      await AssociateWhatsappQueue(
        whatsapp as Whatsapp,
        queues.map(queue => queue.id)
      );
    }
  }

  return {
    brandId: brand.id,
    slug: brand.slug,
    name: brand.name,
    whatsapps: whatsapps.map(item => ({ id: item.id, name: item.name })),
    queues: queues.map(item => ({ id: item.id, name: item.name })),
    agent: agent ? { id: agent.id, name: agent.name } : null,
    knowledgeBases: knowledgeBaseIds,
    issues
  };
};

export const wireBrandLinesForCompany = async (
  companyId: number
): Promise<WireBrandLinesSummary> => {
  const brands = await Brand.findAll({
    where: { companyId, active: true },
    order: [
      ["sortOrder", "ASC"],
      ["id", "ASC"]
    ]
  });

  const lines: WiredBrandLine[] = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const brand of brands) {
    try {
      lines.push(await wireSingleBrand(companyId, brand));
    } catch (error) {
      logger.error(
        { error, companyId, brandId: brand.id },
        "Falha ao religar linha da marca"
      );
      lines.push({
        brandId: brand.id,
        slug: brand.slug,
        name: brand.name,
        whatsapps: [],
        queues: [],
        agent: null,
        knowledgeBases: [],
        issues: [error instanceof Error ? error.message : "erro desconhecido"]
      });
    }
  }

  const summary: WireBrandLinesSummary = {
    companyId,
    ok: lines.every(line => !line.issues.length),
    lines
  };

  logger[summary.ok ? "info" : "warn"](summary, "Linhas de marca religadas");
  return summary;
};

/**
 * Marcas estruturalmente completas o bastante para dispensar o religamento
 * legado por nome. Enquanto uma marca não estiver completa, o caminho antigo
 * continua responsável por ela.
 */
export const hasCompleteBrandWiring = async (
  companyId: number
): Promise<boolean> => {
  const brands = await Brand.findAll({
    where: { companyId, active: true },
    attributes: ["id"]
  });

  if (!brands.length) {
    return false;
  }

  const brandIds = brands.map(brand => brand.id);

  const [whatsapps, agents] = await Promise.all([
    Whatsapp.count({ where: { companyId, brandId: brandIds } }),
    AiAgent.count({ where: { companyId, brandId: brandIds, active: true } })
  ]);

  return whatsapps >= brandIds.length && agents >= brandIds.length;
};
