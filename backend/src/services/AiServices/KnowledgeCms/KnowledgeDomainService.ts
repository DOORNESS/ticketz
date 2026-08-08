import { Op } from "sequelize";
import KnowledgeDomain from "../../../models/KnowledgeDomain";
import AppError from "../../../errors/AppError";
import { validateKnowledgeMetadata } from "./KnowledgeMetadataSchema";
import { slugify } from "./slugify";

export type CreateDomainInput = {
  /** Marca dona deste domínio. Uma Brand pode ter vários domínios. */
  brandId?: number | null;
  companyId: number;
  name: string;
  slug?: string;
  description?: string;
  linkedSpecialty?: string;
  sortOrder?: number;
  active?: boolean;
  metadata?: Record<string, unknown>;
};

export type UpdateDomainInput = Partial<
  Omit<CreateDomainInput, "companyId">
> & {
  companyId: number;
  domainId: number;
};

export const listKnowledgeDomains = async (
  companyId: number
): Promise<KnowledgeDomain[]> =>
  KnowledgeDomain.findAll({
    where: { companyId },
    order: [
      ["sortOrder", "ASC"],
      ["name", "ASC"]
    ]
  });

export const createKnowledgeDomain = async (
  input: CreateDomainInput
): Promise<KnowledgeDomain> => {
  const slug = slugify(input.slug || input.name);
  const existing = await KnowledgeDomain.findOne({
    where: { companyId: input.companyId, slug }
  });

  if (existing) {
    throw new AppError("Domain slug already exists", 409);
  }

  return KnowledgeDomain.create({
    companyId: input.companyId,
    slug,
    name: input.name,
    description: input.description || "",
    linkedSpecialty: input.linkedSpecialty || null,
    sortOrder: input.sortOrder ?? 100,
    active: input.active !== false,
    brandId: input.brandId ?? null,
    metadata: validateKnowledgeMetadata(input.metadata)
  });
};

export const updateKnowledgeDomain = async (
  input: UpdateDomainInput
): Promise<KnowledgeDomain> => {
  const domain = await KnowledgeDomain.findOne({
    where: { id: input.domainId, companyId: input.companyId }
  });

  if (!domain) {
    throw new AppError("Knowledge domain not found", 404);
  }

  const nextSlug = input.slug ? slugify(input.slug) : undefined;
  if (nextSlug && nextSlug !== domain.slug) {
    const conflict = await KnowledgeDomain.findOne({
      where: {
        companyId: input.companyId,
        slug: nextSlug,
        id: { [Op.ne]: domain.id }
      }
    });
    if (conflict) {
      throw new AppError("Domain slug already exists", 409);
    }
  }

  await domain.update({
    ...(input.name != null ? { name: input.name } : {}),
    ...(nextSlug ? { slug: nextSlug } : {}),
    ...(input.description != null ? { description: input.description } : {}),
    ...(input.linkedSpecialty !== undefined
      ? { linkedSpecialty: input.linkedSpecialty }
      : {}),
    ...(input.sortOrder != null ? { sortOrder: input.sortOrder } : {}),
    ...(input.active != null ? { active: input.active } : {}),
    ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
    ...(input.metadata != null
      ? { metadata: validateKnowledgeMetadata(input.metadata) }
      : {})
  });

  return domain;
};

export const getKnowledgeDomain = async (
  companyId: number,
  domainId: number
): Promise<KnowledgeDomain> => {
  const domain = await KnowledgeDomain.findOne({
    where: { id: domainId, companyId }
  });

  if (!domain) {
    throw new AppError("Knowledge domain not found", 404);
  }

  return domain;
};
