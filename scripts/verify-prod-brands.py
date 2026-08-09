#!/usr/bin/env python3
"""Verificação SOMENTE LEITURA da produção após a entrega multimarcas.

Exercita o caminho que realmente quebraria com schema desatualizado: consulta
de Ticket pelo MODEL (não SQL cru), que é onde `brandId` entra no SELECT. Uma
consulta crua passaria mesmo com a coluna ausente e não provaria nada.

Também inventaria o que existe hoje — conexões, filas, agentes, domínios,
bases, contatos, mensagens e usuários — para conferir os vínculos de marca.
"""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip()
if not PASSWORD:
    raise SystemExit(
        "CONTABO_PASSWORD nao definido. A senha da VPS ficava hardcoded aqui "
        "como fallback, num repositorio publico. Defina a variavel de ambiente."
    )
ROOT = os.environ.get("DEPLOY_ROOT", r"C:\ticketz")

VERIFY_JS = r"""
require('./dist/bootstrap');
const sequelize = require('./dist/database').default;
const { QueryTypes } = require('sequelize');
const schema = process.env.DB_SCHEMA || 'ticketz';
const q = (sql, r) => sequelize.query(sql, { replacements: r, type: QueryTypes.SELECT });

(async () => {
  const out = {};

  const t = await q(
    `SELECT table_name AS n FROM information_schema.tables
      WHERE table_schema = :schema AND table_name IN ('Brands','UserBrands')`,
    { schema }
  );
  out.brandTables = t.map(x => x.n);

  // O teste que importa: model, nao SQL cru. Aqui `brandId` entra no SELECT.
  const Ticket = require('./dist/models/Ticket').default;
  try {
    const rows = await Ticket.findAll({ limit: 5, order: [['id', 'DESC']] });
    out.ticketModelQuery = 'OK';
    out.ticketsSample = rows.map(r => ({
      id: r.id, status: r.status, brandId: r.brandId, whatsappId: r.whatsappId
    }));
  } catch (e) {
    out.ticketModelQuery = 'FALHOU: ' + e.message;
  }

  const Brand = require('./dist/models/Brand').default;
  try {
    const brands = await Brand.findAll({ order: [['sortOrder', 'ASC']] });
    out.brands = brands.map(b => ({
      id: b.id, slug: b.slug, name: b.name, active: b.active
    }));
  } catch (e) {
    out.brands = 'FALHOU: ' + e.message;
  }

  const counts = {};
  for (const tbl of ['Whatsapps','Queues','AiAgents','KnowledgeDomains',
                     'KnowledgeBases','Contacts','Messages','Users','Tickets']) {
    const r = await q(`SELECT count(*)::int AS n FROM "${schema}"."${tbl}"`);
    counts[tbl] = r[0].n;
  }
  out.counts = counts;

  out.whatsapps = await q(
    `SELECT id, name, status, "brandId" FROM "${schema}"."Whatsapps" ORDER BY id`
  );
  out.queues = await q(
    `SELECT id, name, "brandId" FROM "${schema}"."Queues" ORDER BY id`
  );
  out.agents = await q(
    `SELECT id, name, active, "brandId" FROM "${schema}"."AiAgents" ORDER BY id`
  );
  out.domains = await q(
    `SELECT id, name, "brandId" FROM "${schema}"."KnowledgeDomains" ORDER BY id`
  );
  out.bases = await q(
    `SELECT id, name, "knowledgeDomainId", "brandId" FROM "${schema}"."KnowledgeBases" ORDER BY id`
  );
  out.users = await q(
    `SELECT id, name, profile, super FROM "${schema}"."Users" ORDER BY id`
  );

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
"""


def main() -> int:
    ps = (
        f"$ErrorActionPreference='Continue'; Set-Location '{ROOT}\\backend'; "
        f"Set-Content -Path '.\\__verify_brands.js' -Value @'\n{VERIFY_JS}\n'@ -Encoding UTF8; "
        "node .\\__verify_brands.js; "
        "Remove-Item '.\\__verify_brands.js' -Force -EA SilentlyContinue"
    )
    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=180,
        read_timeout_sec=210,
    )
    result = session.run_ps(ps)
    print((result.std_out or b"").decode("utf-8", errors="replace").strip())
    err = (result.std_err or b"").decode("utf-8", errors="replace").strip()
    if err:
        print(err[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
