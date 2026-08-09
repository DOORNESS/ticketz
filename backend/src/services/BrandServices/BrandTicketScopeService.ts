import { Op, literal } from "sequelize";
import {
  getBrandAccessForUser,
  resolveBrandFilterForQuery
} from "./BrandAccessService";

/**
 * Escopo de marca para registros que se ligam a um TICKET, não a uma marca.
 *
 * `AiConversationLogs` e `AiReplayLogs` não têm `brandId` — e não deveriam
 * ter: pertencem a um atendimento, e o atendimento já carrega a marca.
 * Duplicar o vínculo criaria duas fontes de verdade que podem divergir (um log
 * marcado "Nível" pendurado num ticket Fortmax).
 *
 * O filtro é uma SUBCONSULTA, não uma lista de ids. A primeira versão deste
 * service carregava todos os tickets da marca para montar um `IN (...)`: com
 * os dois tickets de hoje funciona, com cem mil vira uma query gigante e uma
 * varredura inútil só para descobrir de quem é cada log. O banco resolve isso
 * com um índice; trazer os ids para o Node não.
 */
export const buildBrandTicketFilter = async (
  companyId: number,
  userId: number | string,
  requestedBrandIds?: number[]
): Promise<{ [Op.in]: ReturnType<typeof literal> } | null> => {
  const access = await getBrandAccessForUser(userId);
  const brandIds = resolveBrandFilterForQuery(access, requestedBrandIds);

  if (brandIds === null) {
    return null;
  }

  const schema = process.env.DB_SCHEMA || "ticketz";

  // `brandIds` vem de `resolveBrandFilterForQuery`, que devolve inteiros
  // vindos do banco — nunca texto da querystring. Ainda assim passam por
  // `Number` aqui: literal não parametriza, e a garantia tem que ser local.
  const safeIds = brandIds.map(Number).filter(Number.isFinite);

  // Lista vazia = usuário sem marca permitida. `IN (NULL)` não casa com nada,
  // que é o resultado correto — e evita SQL inválido com `IN ()`.
  const inList = safeIds.length ? safeIds.join(",") : "NULL";

  return {
    [Op.in]: literal(
      `(SELECT "id" FROM "${schema}"."Tickets" ` +
        `WHERE "companyId" = ${Number(companyId)} ` +
        `AND "brandId" IN (${inList}))`
    )
  };
};

/**
 * `brandIds` chega como `?brandIds[]=1` ou `?brandIds=1`. É apenas um PEDIDO:
 * quem decide o alcance é `resolveBrandFilterForQuery`, cruzando com o que o
 * usuário pode ver.
 */
export const parseRequestedBrandIds = (raw: unknown): number[] | undefined => {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const list = Array.isArray(raw) ? raw : [raw];
  const parsed = list.map(Number).filter(value => Number.isFinite(value));
  return parsed.length ? parsed : undefined;
};
