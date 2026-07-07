import { Request, Response } from "express";
import KnowledgeBase from "../models/KnowledgeBase";
import AppError from "../errors/AppError";
import { safeAiQuery } from "../helpers/safeAiQuery";

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
  return res.json(bases);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, description, active } = req.body;

  const base = await KnowledgeBase.create({
    companyId,
    name,
    description,
    active: active !== false
  });

  return res.status(201).json(base);
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

  await base.update(req.body);
  return res.json(base);
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
