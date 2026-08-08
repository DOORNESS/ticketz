/**
 * Backfill das marcas a partir dos vínculos existentes.
 *
 * Idempotente: rodar de novo não duplica marca nem sobrescreve vínculo já
 * definido pelo admin — só preenche o que está nulo.
 *
 * É o único lugar onde o casamento por nome de conexão é usado de propósito:
 * para descobrir uma única vez quais conexões pertencem a quais marcas e
 * gravar isso em FK. Depois disso o runtime não olha mais para nome.
 *
 * Uso:
 *   cd backend && COMPANY_ID=1 npm run backfill:brands
 *
 * Sai com código 1 se sobrar registro sem marca, para o passo seguinte do
 * runbook não ser executado sobre dados incompletos.
 */
import "../bootstrap";
import sequelize from "../database";
import { backfillBrandsForCompany } from "../services/BrandServices/BackfillBrandsService";

const companyId = Number(process.env.COMPANY_ID || 1);

(async () => {
  await sequelize.authenticate();

  const summary = await backfillBrandsForCompany(companyId);

  console.log(`\n═══ Backfill de marcas — company ${companyId} ═══\n`);

  summary.brands.forEach(brand => {
    console.log(
      `  ${brand.created ? "criada" : "existente"}  ${brand.slug} (#${brand.brandId})`
    );
    console.log(
      `      conexões ${brand.whatsapps} · filas ${brand.queues} · agentes ${brand.agents} · ` +
        `domínios ${brand.domains} · bases ${brand.knowledgeBases} · tickets ${brand.tickets}`
    );
  });

  console.log("");

  let pending = 0;

  if (summary.whatsappsWithoutBrand.length) {
    pending += summary.whatsappsWithoutBrand.length;
    console.log("  Conexões sem marca (vincule na tela de Conexões):");
    summary.whatsappsWithoutBrand.forEach(item =>
      console.log(`      · #${item.id} ${item.name}`)
    );
  }

  if (summary.ticketsWithoutBrand) {
    console.log(
      `  Tickets sem marca: ${summary.ticketsWithoutBrand} ` +
        "(nasceram em conexão ainda sem marca)"
    );
  }

  console.log(
    pending
      ? "\n✗ Há registros sem marca — resolva antes de rodar audit:brands.\n"
      : "\n✓ Backfill completo.\n"
  );

  process.exit(pending ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
