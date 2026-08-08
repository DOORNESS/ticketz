import Brand from "../../models/Brand";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";

/**
 * Resolução da marca de um atendimento.
 *
 * A origem define a marca: a conexão de WhatsApp aponta para a Brand por FK.
 * O texto da mensagem **nunca** participa desta decisão — conteúdo define
 * intenção, não empresa.
 *
 * Durante a transição existe um fallback por nome da conexão, herdado do
 * modelo antigo. Ele é instrumentado: toda vez que é acionado grava um
 * `warn` com `legacyBrandFallback`. Enquanto esse log aparecer, ainda há
 * conexão sem `brandId` — é essa a evidência que autoriza removê-lo.
 */

const normalizeName = (value: string): string =>
  (value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Casamento por nome — SOMENTE para backfill e fallback de transição.
 * Não use em código novo: é exatamente a fragilidade que a Brand elimina.
 */
export const legacyMatchBrandSlugByName = (
  whatsappName: string
): string | null => {
  const name = normalizeName(whatsappName);
  if (!name) {
    return null;
  }

  if (
    name.includes("nivel") &&
    !name.includes("fortmax") &&
    !name.includes("webg3") &&
    !name.includes("web g3")
  ) {
    return "nivel";
  }

  // "fortcontrol" cai na Fortmax de propósito: FortControl é produto da suíte
  // (PCP, estoque, financeiro), não operação com atendimento próprio. Se um dia
  // ganhar canal separado, cria-se a marca pelo painel e vincula-se a conexão
  // pela tela de Conexões — a FK vence este casamento por nome.
  if (
    name.includes("fortmax") ||
    name.includes("webg3") ||
    name.includes("web g3") ||
    name.includes("fortcontrol")
  ) {
    return "fortmax";
  }

  return null;
};

export const resolveBrandForWhatsapp = async (
  companyId: number,
  whatsappId?: number | null
): Promise<Brand | null> => {
  if (!whatsappId) {
    return null;
  }

  const whatsapp = await Whatsapp.findOne({
    where: { id: whatsappId, companyId },
    attributes: ["id", "name", "brandId", "companyId"]
  });

  if (!whatsapp) {
    return null;
  }

  if (whatsapp.brandId) {
    return Brand.findOne({
      where: { id: whatsapp.brandId, companyId }
    });
  }

  const legacySlug = legacyMatchBrandSlugByName(whatsapp.name);
  if (!legacySlug) {
    return null;
  }

  const brand = await Brand.findOne({
    where: { companyId, slug: legacySlug }
  });

  if (brand) {
    logger.warn(
      {
        legacyBrandFallback: true,
        companyId,
        whatsappId: whatsapp.id,
        whatsappName: whatsapp.name,
        resolvedBrandId: brand.id
      },
      "Brand resolvida pelo nome da conexão — vincular brandId no Whatsapp"
    );
  }

  return brand;
};

export const resolveBrandIdForWhatsapp = async (
  companyId: number,
  whatsappId?: number | null
): Promise<number | null> => {
  const brand = await resolveBrandForWhatsapp(companyId, whatsappId);
  return brand?.id ?? null;
};

export const listActiveBrands = async (companyId: number): Promise<Brand[]> =>
  Brand.findAll({
    where: { companyId, active: true },
    order: [
      ["sortOrder", "ASC"],
      ["id", "ASC"]
    ]
  });

export const findBrandBySlug = async (
  companyId: number,
  slug: string
): Promise<Brand | null> => Brand.findOne({ where: { companyId, slug } });
