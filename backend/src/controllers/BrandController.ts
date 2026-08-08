import { Request, Response } from "express";
import * as Yup from "yup";
import Brand from "../models/Brand";
import UserBrand from "../models/UserBrand";
import AppError from "../errors/AppError";
import { listBrandsVisibleToUser } from "../services/BrandServices/BrandAccessService";
import { backfillBrandsForCompany } from "../services/BrandServices/BackfillBrandsService";

const slugPattern = /^[a-z0-9][a-z0-9-]{1,62}$/;

/**
 * Marcas que o usuário logado pode ver — alimenta o seletor global.
 * "Todas" no frontend significa todas as retornadas aqui, não todas as
 * existentes na company.
 */
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const brands = await listBrandsVisibleToUser(Number(companyId), userId);

  return res.status(200).json(
    brands.map(brand => ({
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      shortLabel: brand.shortLabel || brand.name,
      primaryColor: brand.primaryColor,
      logoUrl: brand.logoUrl,
      active: brand.active,
      sortOrder: brand.sortOrder
    }))
  );
};

/** Listagem administrativa: todas as marcas, com os campos de configuração. */
export const adminIndex = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;

  const brands = await Brand.findAll({
    where: { companyId },
    order: [
      ["sortOrder", "ASC"],
      ["id", "ASC"]
    ]
  });

  return res.status(200).json(brands);
};

const brandSchema = Yup.object().shape({
  slug: Yup.string().required().matches(slugPattern, "ERR_BRAND_INVALID_SLUG"),
  name: Yup.string().required().min(2)
});

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const payload = req.body;

  try {
    await brandSchema.validate(payload);
  } catch (error) {
    throw new AppError((error as Yup.ValidationError).message, 400);
  }

  const existing = await Brand.findOne({
    where: { companyId, slug: payload.slug }
  });
  if (existing) {
    throw new AppError("ERR_BRAND_SLUG_ALREADY_EXISTS", 409);
  }

  const brand = await Brand.create({ ...payload, companyId });
  return res.status(201).json(brand);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { brandId } = req.params;

  const brand = await Brand.findOne({
    where: { id: brandId, companyId }
  });
  if (!brand) {
    throw new AppError("ERR_BRAND_NOT_FOUND", 404);
  }

  const payload = { ...req.body };
  // slug é identidade estável usada em vínculos; não se troca por update.
  delete payload.slug;
  delete payload.companyId;

  await brand.update(payload);
  return res.status(200).json(brand);
};

/**
 * Desativa em vez de apagar: tickets antigos precisam continuar apontando
 * para a marca de origem.
 */
export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { brandId } = req.params;

  const brand = await Brand.findOne({ where: { id: brandId, companyId } });
  if (!brand) {
    throw new AppError("ERR_BRAND_NOT_FOUND", 404);
  }

  await brand.update({ active: false });
  return res.status(200).json({ ok: true, brandId: brand.id });
};

/** Marcas de um funcionário, para o formulário de cadastro. */
export const userBrands = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { userId } = req.params;

  const links = await UserBrand.findAll({
    where: { userId, companyId },
    attributes: ["brandId", "canAttend"]
  });

  return res.status(200).json(links);
};

export const setUserBrands = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { userId } = req.params;
  const { brands } = req.body as {
    brands: { brandId: number; canAttend?: boolean }[];
  };

  if (!Array.isArray(brands)) {
    throw new AppError("ERR_BRAND_INVALID_PAYLOAD", 400);
  }

  const validBrands = await Brand.findAll({
    where: { companyId, id: brands.map(item => item.brandId) },
    attributes: ["id"]
  });
  const validIds = validBrands.map(brand => brand.id);

  await UserBrand.destroy({ where: { userId, companyId } });

  const created = await UserBrand.bulkCreate(
    brands
      .filter(item => validIds.includes(Number(item.brandId)))
      .map(item => ({
        userId: Number(userId),
        brandId: Number(item.brandId),
        companyId: Number(companyId),
        canAttend: item.canAttend !== false
      })) as never
  );

  return res.status(200).json(created);
};

/** Backfill sob demanda — idempotente, usado na migração. */
export const backfill = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const summary = await backfillBrandsForCompany(Number(companyId));
  return res.status(200).json(summary);
};
