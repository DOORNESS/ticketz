import { Op } from "sequelize";
import Brand from "../../models/Brand";
import AiAgent from "../../models/AiAgent";
import KnowledgeBase from "../../models/KnowledgeBase";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";

/**
 * Configuração de IA a partir da marca do ticket.
 *
 * Resolve agente e bases pelo `brandId` gravado no atendimento, não pelo nome
 * da conexão nem por substring no prompt. O caminho antigo (fila → agente)
 * segue como fallback enquanto houver ticket sem marca; quando ele é usado,
 * fica registrado em log para se poder provar que já não é necessário.
 */

export const getBrandForTicket = async (
  ticket: Pick<Ticket, "companyId" | "brandId">
): Promise<Brand | null> => {
  if (!ticket.brandId) {
    return null;
  }

  return Brand.findOne({
    where: { id: ticket.brandId, companyId: ticket.companyId }
  });
};

/**
 * Agente ativo da marca. Uma marca tem no máximo um agente de primeira linha
 * (`legacy`/`specialist`); orquestrador continua fora deste caminho.
 */
export const getAgentForBrand = async (
  companyId: number,
  brandId?: number | null
): Promise<AiAgent | null> => {
  if (!brandId) {
    return null;
  }

  return AiAgent.findOne({
    where: {
      companyId,
      brandId,
      active: true,
      role: { [Op.in]: ["legacy", "specialist"] }
    },
    order: [["id", "ASC"]]
  });
};

export const getKnowledgeBaseIdsForBrand = async (
  companyId: number,
  brandId?: number | null
): Promise<number[]> => {
  if (!brandId) {
    return [];
  }

  const bases = await KnowledgeBase.findAll({
    where: { companyId, brandId, active: true },
    attributes: ["id"],
    order: [["id", "ASC"]]
  });

  return bases.map(base => base.id);
};

/**
 * Isolamento de conhecimento: dado um conjunto de bases candidatas, mantém
 * apenas as que pertencem à marca do atendimento. É a barreira que impede a
 * base da Nível de responder num ticket da Fortmax.
 *
 * Bases sem marca (legado, antes do backfill) são preservadas — remover
 * silenciosamente deixaria o agente sem contexto.
 */
export const restrictKnowledgeBasesToBrand = async (
  companyId: number,
  brandId: number | null | undefined,
  candidateBaseIds: number[]
): Promise<number[]> => {
  if (!brandId || !candidateBaseIds.length) {
    return candidateBaseIds;
  }

  const bases = await KnowledgeBase.findAll({
    where: { companyId, id: { [Op.in]: candidateBaseIds } },
    attributes: ["id", "brandId"]
  });

  const allowed = bases
    .filter(base => !base.brandId || base.brandId === brandId)
    .map(base => base.id);

  const blocked = bases.length - allowed.length;
  if (blocked > 0) {
    logger.info(
      { companyId, brandId, blocked },
      "Bases de outra marca removidas do contexto"
    );
  }

  return allowed;
};

export type BrandPersona = {
  identityReply?: string | null;
  informationalFallback?: string | null;
  escalationUrl?: string | null;
  supportContacts: { name: string; role?: string; whatsapp?: string }[];
  vocabulary: string[];
};

export const getBrandPersona = (brand?: Brand | null): BrandPersona => ({
  identityReply: brand?.identityReply || null,
  informationalFallback: brand?.informationalFallback || null,
  escalationUrl: brand?.escalationUrl || null,
  supportContacts: brand?.supportContacts || [],
  vocabulary: brand?.vocabulary || []
});
