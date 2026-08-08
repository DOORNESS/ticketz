import { Request, Response } from "express";
import KnowledgeBase from "../models/KnowledgeBase";
import AppError from "../errors/AppError";
import { safeAiQuery } from "../helpers/safeAiQuery";
import {
  listAgentsByKnowledgeBase,
  listAgentsGroupedByKnowledgeBase
} from "../services/AiServices/AiAgentKnowledgeBaseService";
import { getAssetCountsByKnowledgeBase } from "../services/AiServices/KnowledgeCms/KnowledgeAssetCmsService";
import KnowledgeDomain from "../models/KnowledgeDomain";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const bases = await safeAiQuery(
    () =>
      KnowledgeBase.findAll({
        where: { companyId },
        order: [["name", "ASC"]]
      }),
    []
  );

  const baseIds = bases.map(base => base.id);
  const [linkedAgentsByBase, assetCountsByBase] = await Promise.all([
    safeAiQuery(() => listAgentsGroupedByKnowledgeBase(companyId, baseIds), {}),
    safeAiQuery(() => getAssetCountsByKnowledgeBase(companyId), {})
  ]);

  const enriched = bases.map(base => ({
    ...base.toJSON(),
    linkedAgents: linkedAgentsByBase[base.id] || [],
    assetCounts: assetCountsByBase[base.id] || { total: 0, published: 0 }
  }));

  return res.json(enriched);
};

/**
 * A marca da base é DERIVADA do domínio, nunca escolhida à parte.
 *
 * Um seletor próprio permitiria base da marca A dentro de domínio da marca B —
 * exatamente a combinação inválida que o isolamento do RAG não conseguiria
 * resolver depois. Aqui a incoerência é impossível por construção.
 */
const resolveBrandFromDomain = async (
  companyId: number,
  knowledgeDomainId?: number | null
): Promise<number | null> => {
  if (!knowledgeDomainId) {
    return null;
  }

  const domain = await KnowledgeDomain.findOne({
    where: { id: knowledgeDomainId, companyId },
    attributes: ["brandId"]
  });

  return domain?.brandId ?? null;
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, description, active, knowledgeDomainId } = req.body;

  const base = await KnowledgeBase.create({
    companyId,
    name,
    description,
    knowledgeDomainId: knowledgeDomainId || null,
    brandId: await resolveBrandFromDomain(companyId, knowledgeDomainId),
    active: active !== false
  });

  return res.status(201).json({
    ...base.toJSON(),
    linkedAgents: [],
    assetCounts: { total: 0, published: 0 }
  });
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { baseId } = req.params;

  const base = await KnowledgeBase.findOne({
    where: { id: baseId, companyId }
  });

  if (!base) {
    throw new AppError("Knowledge base not found", 404);
  }

  const payload = { ...req.body };
  // Trocar de domínio move a base de marca junto — os dois nunca divergem.
  if (payload.knowledgeDomainId !== undefined) {
    payload.brandId = await resolveBrandFromDomain(
      companyId,
      payload.knowledgeDomainId
    );
  }
  delete payload.companyId;

  await base.update(payload);
  return res.json({
    ...base.toJSON(),
    linkedAgents: await listAgentsByKnowledgeBase(companyId, base.id),
    assetCounts: (await getAssetCountsByKnowledgeBase(companyId))[base.id] || {
      total: 0,
      published: 0
    }
  });
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { baseId } = req.params;

  const base = await KnowledgeBase.findOne({
    where: { id: baseId, companyId }
  });

  if (!base) {
    throw new AppError("Knowledge base not found", 404);
  }

  await base.destroy();
  return res.status(200).json({ message: "Knowledge base deleted" });
};
