import Brand from "../../models/Brand";
import UserBrand from "../../models/UserBrand";
import User from "../../models/User";
import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";

/**
 * Autorização por marca.
 *
 * Regra central: a decisão vive no backend. O frontend esconde opções por
 * conveniência, mas quem barra listagem, abertura por URL, envio de mensagem
 * e acesso a anexo é este módulo.
 *
 * Admin e super enxergam todas as marcas da company — é o comportamento que
 * já existe hoje para filas, e mudá-lo aqui quebraria a supervisão atual.
 * Para os demais perfis, vale a allowlist em `UserBrands`.
 */

export type BrandAccess = {
  /** null = todas as marcas da company (admin/super). */
  visibleBrandIds: number[] | null;
  attendableBrandIds: number[] | null;
  isUnrestricted: boolean;
};

const isUnrestrictedProfile = (user: {
  profile?: string | null;
  super?: boolean | null;
}): boolean => user?.super === true || user?.profile === "admin";

export const getBrandAccessForUser = async (
  userId: number | string
): Promise<BrandAccess> => {
  const user = await User.findByPk(userId, {
    attributes: ["id", "profile", "super", "companyId"]
  });

  if (!user) {
    return {
      visibleBrandIds: [],
      attendableBrandIds: [],
      isUnrestricted: false
    };
  }

  if (isUnrestrictedProfile(user)) {
    return {
      visibleBrandIds: null,
      attendableBrandIds: null,
      isUnrestricted: true
    };
  }

  const links = await UserBrand.findAll({
    where: { userId: user.id, companyId: user.companyId },
    attributes: ["brandId", "canAttend"]
  });

  /**
   * Nenhum vínculo = usuário legado, ainda não configurado pelo admin.
   *
   * Trata-se como "sem restrição" de propósito. A alternativa — tratar como
   * "sem acesso" — derrubaria todos os atendentes existentes no instante do
   * deploy, já que ninguém tem vínculo antes de o admin abrir o cadastro.
   * O isolamento passa a valer para o usuário assim que ele recebe a primeira
   * marca. Mesma regra em `canViewTicket.userCanSeeTicketBrand`.
   */
  if (!links.length) {
    return {
      visibleBrandIds: null,
      attendableBrandIds: null,
      isUnrestricted: true
    };
  }

  return {
    visibleBrandIds: links.map(link => link.brandId),
    attendableBrandIds: links
      .filter(link => link.canAttend)
      .map(link => link.brandId),
    isUnrestricted: false
  };
};

/**
 * Marcas que o seletor global deve oferecer.
 * "Todas" significa todas as **permitidas**, não todas as existentes.
 */
export const listBrandsVisibleToUser = async (
  companyId: number,
  userId: number | string
): Promise<Brand[]> => {
  const access = await getBrandAccessForUser(userId);

  if (access.isUnrestricted) {
    return Brand.findAll({
      where: { companyId, active: true },
      order: [
        ["sortOrder", "ASC"],
        ["id", "ASC"]
      ]
    });
  }

  if (!access.visibleBrandIds?.length) {
    return [];
  }

  return Brand.findAll({
    where: { companyId, active: true, id: access.visibleBrandIds },
    order: [
      ["sortOrder", "ASC"],
      ["id", "ASC"]
    ]
  });
};

export const canViewBrand = (
  access: BrandAccess,
  brandId?: number | null
): boolean => {
  if (access.isUnrestricted) {
    return true;
  }

  // Ticket sem marca (legado, antes do backfill) fica visível apenas para
  // quem não tem restrição — assim nada vaza para um atendente restrito.
  if (!brandId) {
    return false;
  }

  return (access.visibleBrandIds || []).includes(brandId);
};

export const canAttendBrand = (
  access: BrandAccess,
  brandId?: number | null
): boolean => {
  if (access.isUnrestricted) {
    return true;
  }

  if (!brandId) {
    return false;
  }

  return (access.attendableBrandIds || []).includes(brandId);
};

/**
 * Interseção entre o filtro pedido pela UI e o que o usuário pode ver.
 * Devolve `null` quando não há restrição a aplicar na query.
 */
export const resolveBrandFilterForQuery = (
  access: BrandAccess,
  requestedBrandIds?: number[] | null
): number[] | null => {
  const requested = (requestedBrandIds || []).filter(Boolean);

  if (access.isUnrestricted) {
    return requested.length ? requested : null;
  }

  const allowed = access.visibleBrandIds || [];
  if (!requested.length) {
    return allowed;
  }

  return requested.filter(id => allowed.includes(id));
};

export const assertCanViewTicketBrand = async (
  ticket: Pick<Ticket, "brandId">,
  userId: number | string
): Promise<void> => {
  const access = await getBrandAccessForUser(userId);
  if (!canViewBrand(access, ticket.brandId)) {
    throw new AppError("ERR_NO_PERMISSION_BRAND", 403);
  }
};

export const assertCanAttendTicketBrand = async (
  ticket: Pick<Ticket, "brandId">,
  userId: number | string
): Promise<void> => {
  const access = await getBrandAccessForUser(userId);
  if (!canAttendBrand(access, ticket.brandId)) {
    throw new AppError("ERR_NO_PERMISSION_BRAND", 403);
  }
};
