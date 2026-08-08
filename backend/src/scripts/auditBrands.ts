/**
 * Diagnóstico de marcas — o relatório que autoriza fechar o isolamento.
 *
 * Somente leitura: não cria, não vincula, não adivinha. Se um registro está
 * ambíguo, ele aparece aqui para decisão humana em vez de ser resolvido em
 * silêncio pelo casamento por nome.
 *
 * Rode antes de ligar `brandIsolationEnforced`. Sai com código 1 enquanto
 * houver pendência que produziria perda de acesso ou vazamento.
 *
 * Uso:
 *   cd backend && COMPANY_ID=1 npm run audit:brands
 */
import { Op } from "sequelize";
import "../bootstrap";
import sequelize from "../database";
import Brand from "../models/Brand";
import Whatsapp from "../models/Whatsapp";
import Queue from "../models/Queue";
import AiAgent from "../models/AiAgent";
import KnowledgeDomain from "../models/KnowledgeDomain";
import KnowledgeBase from "../models/KnowledgeBase";
import Ticket from "../models/Ticket";
import User from "../models/User";
import UserBrand from "../models/UserBrand";
import { legacyMatchBrandSlugByName } from "../services/BrandServices/BrandResolutionService";
import { isBrandIsolationEnforced } from "../services/BrandServices/BrandAccessService";

const companyId = Number(process.env.COMPANY_ID || 1);

const line = (label: string, value: string | number) =>
  console.log(`  ${label.padEnd(38)} ${value}`);

const listOrphans = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  label: string
): Promise<{ id: number; name: string }[]> => {
  const rows = await model.findAll({
    where: { companyId, brandId: { [Op.is]: null } },
    attributes: ["id", "name"],
    order: [["id", "ASC"]]
  });

  const items = rows.map((row: { id: number; name: string }) => ({
    id: row.id,
    name: row.name
  }));

  line(`${label} sem marca`, items.length);
  items.forEach(item => console.log(`      · #${item.id} ${item.name}`));
  return items;
};

(async () => {
  await sequelize.authenticate();

  let blocking = 0;

  console.log(`\n═══ Diagnóstico de marcas — company ${companyId} ═══\n`);

  const brands = await Brand.findAll({
    where: { companyId },
    order: [["sortOrder", "ASC"]]
  });

  console.log("MARCAS");
  line("total", brands.length);
  brands.forEach(brand =>
    console.log(
      `      · #${brand.id} ${brand.slug} — ${brand.name}${
        brand.active ? "" : " (INATIVA)"
      }`
    )
  );
  if (!brands.length) {
    blocking += 1;
    console.log("      ⚠ nenhuma marca — rode o backfill antes de continuar");
  }

  console.log("\nVÍNCULOS ESTRUTURAIS");
  const orphanWhatsapps = await listOrphans(Whatsapp, "conexões");
  await listOrphans(Queue, "filas");
  await listOrphans(AiAgent, "agentes IA");
  await listOrphans(KnowledgeDomain, "domínios");
  const orphanBases = await listOrphans(KnowledgeBase, "bases");

  const ticketsWithoutBrand = await Ticket.count({
    where: { companyId, brandId: { [Op.is]: null } }
  });
  line("tickets sem marca", ticketsWithoutBrand);

  /**
   * Conexão sem marca é bloqueante: todo ticket que nascer nela fica sem
   * `brandId` e, com o isolamento ligado, some para qualquer atendente
   * restrito.
   */
  if (orphanWhatsapps.length) {
    blocking += 1;
    console.log(
      "      ⚠ conexão sem marca gera ticket sem marca — vincule antes de ligar o isolamento"
    );
  }

  /** Base sem marca é lida por todas as marcas — risco de vazamento de conhecimento. */
  if (orphanBases.length) {
    console.log("      ⚠ base sem marca fica visível a todas as marcas no RAG");
  }

  console.log("\nAMBIGUIDADE DE ORIGEM");
  const ambiguous = orphanWhatsapps.filter(
    item => legacyMatchBrandSlugByName(item.name) === null
  );
  line("conexões sem marca e sem padrão reconhecível", ambiguous.length);
  ambiguous.forEach(item =>
    console.log(
      `      · #${item.id} "${item.name}" — precisa de vínculo manual`
    )
  );

  console.log("\nFUNCIONÁRIOS");
  const users = await User.findAll({
    where: { companyId },
    attributes: ["id", "name", "email", "profile", "super"],
    order: [["id", "ASC"]]
  });

  const links = await UserBrand.findAll({
    where: { companyId },
    attributes: ["userId", "brandId", "canAttend"]
  });

  const byUser = new Map<number, { brandId: number; canAttend: boolean }[]>();
  links.forEach(link => {
    const list = byUser.get(link.userId) || [];
    list.push({ brandId: link.brandId, canAttend: link.canAttend });
    byUser.set(link.userId, list);
  });

  const commonWithoutBrand = users.filter(
    user =>
      user.profile !== "admin" && !user.super && !byUser.get(user.id)?.length
  );

  const unrestricted = users.filter(
    user => user.profile === "admin" || user.super
  );

  line("total", users.length);
  line("admin/super (acesso irrestrito)", unrestricted.length);
  line("comuns com marca atribuída", byUser.size);
  line("comuns SEM marca atribuída", commonWithoutBrand.length);
  commonWithoutBrand.forEach(user =>
    console.log(`      · #${user.id} ${user.name} <${user.email}>`)
  );

  const viewOnly = links.filter(link => !link.canAttend);
  line("vínculos somente supervisão (canAttend=false)", viewOnly.length);

  /**
   * Ligar o isolamento com funcionário comum sem marca o deixa sem enxergar
   * nada. É a única forma de o fechamento derrubar alguém, então é bloqueante.
   */
  if (commonWithoutBrand.length) {
    blocking += 1;
    console.log(
      "      ⚠ estes funcionários perderão todo o acesso se o isolamento for ligado agora"
    );
  }

  const enforced = await isBrandIsolationEnforced(companyId);
  console.log("\nISOLAMENTO");
  line("brandIsolationEnforced", enforced ? "enabled" : "disabled");

  console.log(
    blocking
      ? `\n✗ ${blocking} pendência(s) bloqueante(s) — NÃO ligue o isolamento ainda.\n`
      : "\n✓ Sem pendências bloqueantes: seguro ligar brandIsolationEnforced.\n"
  );

  process.exit(blocking ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
