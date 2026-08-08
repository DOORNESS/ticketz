/**
 * Liga e desliga `brandIsolationEnforced` com trava de segurança.
 *
 * Ligar o isolamento é a única operação desta entrega capaz de tirar acesso de
 * quem hoje trabalha normalmente: funcionário comum sem marca atribuída passa a
 * enxergar nada. Por isso ligar exige que `audit:brands` esteja limpo — o
 * script recusa quando há funcionário comum sem marca ou conexão sem marca.
 *
 * Desligar nunca é bloqueado: é a rota de volta, e ela precisa ser rápida.
 *
 * Uso:
 *   COMPANY_ID=1 npm run brand:isolation -- status
 *   COMPANY_ID=1 npm run brand:isolation -- enable
 *   COMPANY_ID=1 npm run brand:isolation -- disable
 *   COMPANY_ID=1 npm run brand:isolation -- enable --force   (pula a trava)
 */
import { Op } from "sequelize";
import "../bootstrap";
import sequelize from "../database";
import Setting from "../models/Setting";
import Brand from "../models/Brand";
import Whatsapp from "../models/Whatsapp";
import User from "../models/User";
import UserBrand from "../models/UserBrand";

const companyId = Number(process.env.COMPANY_ID || 1);
const KEY = "brandIsolationEnforced";

const action = (process.argv[2] || "status").toLowerCase();
const force = process.argv.includes("--force");

const readCurrent = async (): Promise<string> => {
  const setting = await Setting.findOne({ where: { companyId, key: KEY } });
  return (setting?.value || "disabled").trim().toLowerCase();
};

const write = async (value: "enabled" | "disabled"): Promise<void> => {
  const existing = await Setting.findOne({ where: { companyId, key: KEY } });
  if (existing) {
    await existing.update({ value });
    return;
  }
  await Setting.create({ companyId, key: KEY, value } as never);
};

type Blocker = { label: string; detail: string };

/** Mesmas condições bloqueantes de `audit:brands`, verificadas de novo aqui. */
const findBlockers = async (): Promise<Blocker[]> => {
  const blockers: Blocker[] = [];

  const brands = await Brand.count({ where: { companyId, active: true } });
  if (!brands) {
    blockers.push({
      label: "nenhuma marca ativa",
      detail: "rode o backfill antes"
    });
  }

  const orphanWhatsapps = await Whatsapp.findAll({
    where: { companyId, brandId: { [Op.is]: null } },
    attributes: ["id", "name"]
  });
  if (orphanWhatsapps.length) {
    blockers.push({
      label: `${orphanWhatsapps.length} conexão(ões) sem marca`,
      detail: orphanWhatsapps.map(w => `#${w.id} ${w.name}`).join(", ")
    });
  }

  const users = await User.findAll({
    where: { companyId },
    attributes: ["id", "name", "email", "profile", "super"]
  });
  const links = await UserBrand.findAll({
    where: { companyId },
    attributes: ["userId"]
  });
  const linked = new Set(links.map(link => link.userId));
  const orphanUsers = users.filter(
    user => user.profile !== "admin" && !user.super && !linked.has(user.id)
  );
  if (orphanUsers.length) {
    blockers.push({
      label: `${orphanUsers.length} funcionário(s) comum(ns) sem marca`,
      detail: orphanUsers.map(u => `${u.name} <${u.email}>`).join(", ")
    });
  }

  return blockers;
};

(async () => {
  await sequelize.authenticate();
  const current = await readCurrent();

  if (action === "status") {
    console.log(`brandIsolationEnforced (company ${companyId}): ${current}`);
    const blockers = await findBlockers();
    if (blockers.length) {
      console.log("\nPendências que impedem ligar:");
      blockers.forEach(b => console.log(`  · ${b.label} — ${b.detail}`));
    } else {
      console.log("\nSem pendências: seguro ligar.");
    }
    process.exit(0);
  }

  if (action === "disable") {
    await write("disabled");
    console.log(
      `brandIsolationEnforced: ${current} → disabled (company ${companyId})`
    );
    console.log(
      "Funcionário sem marca volta a enxergar o que enxergava antes."
    );
    process.exit(0);
  }

  if (action !== "enable") {
    console.error(`Ação inválida: ${action}. Use status | enable | disable.`);
    process.exit(1);
  }

  const blockers = await findBlockers();
  if (blockers.length && !force) {
    console.error("Não é seguro ligar o isolamento agora:\n");
    blockers.forEach(b => console.error(`  · ${b.label} — ${b.detail}`));
    console.error(
      "\nCorrija os vínculos e rode de novo, ou use --force se souber o que está fazendo."
    );
    process.exit(1);
  }

  if (blockers.length && force) {
    console.warn("Ligando com --force, apesar de:");
    blockers.forEach(b => console.warn(`  · ${b.label} — ${b.detail}`));
  }

  await write("enabled");
  console.log(
    `brandIsolationEnforced: ${current} → enabled (company ${companyId})`
  );
  console.log("Para reverter: npm run brand:isolation -- disable");
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
