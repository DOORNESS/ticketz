import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import {
  getBrandAccessForUser,
  resolveBrandFilterForQuery
} from "./BrandAccessService";

/**
 * Escopo de marca para registros que se ligam a um TICKET, não a uma marca.
 *
 * `AiConversationLogs` e `AiReplayLogs` não têm `brandId` — e não deveriam
 * ter: eles pertencem a um atendimento, e o atendimento já carrega a marca.
 * Duplicar o vínculo criaria duas fontes de verdade que podem divergir (um log
 * marcado "Nível" pendurado num ticket Fortmax).
 *
 * Devolve `null` quando não há restrição — o chamador não filtra nada.
 */
export const resolveTicketIdsForBrandScope = async (
  companyId: number,
  userId: number | string,
  requestedBrandIds?: number[]
): Promise<number[] | null> => {
  const access = await getBrandAccessForUser(userId);
  const brandIds = resolveBrandFilterForQuery(access, requestedBrandIds);

  if (brandIds === null) {
    return null;
  }

  const tickets = await Ticket.findAll({
    where: { companyId, brandId: { [Op.in]: brandIds } },
    attributes: ["id"]
  });

  return tickets.map(ticket => Number(ticket.id));
};

/**
 * `brandIds` chega como `?brandIds[]=1` ou `?brandIds=1`. É apenas um PEDIDO:
 * quem decide o alcance é `resolveBrandFilterForQuery`, cruzando com o que o
 * usuário pode ver.
 */
export const parseRequestedBrandIds = (
  raw: unknown
): number[] | undefined => {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const list = Array.isArray(raw) ? raw : [raw];
  const parsed = list.map(Number).filter(value => Number.isFinite(value));
  return parsed.length ? parsed : undefined;
};
