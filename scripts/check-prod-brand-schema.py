#!/usr/bin/env python3
"""Diagnóstico SOMENTE LEITURA do schema multimarcas em produção.

Não altera nada: só consulta `information_schema` e `SequelizeMeta` para
responder uma pergunta objetiva — as colunas e tabelas que o código novo
espera já existem no banco?

Roda na própria VPS via WinRM, usando o `.env` que o backend usa, para não
depender de credencial de banco em lugar nenhum além de onde ela já está.
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

CHECK_JS = r"""
require('./dist/bootstrap');
const sequelize = require('./dist/database').default;
const { QueryTypes } = require('sequelize');
const schema = process.env.DB_SCHEMA || 'ticketz';
const q = (sql, replacements) =>
  sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

(async () => {
  const out = {};

  const tables = await q(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = :schema AND table_name IN ('Brands','UserBrands')`,
    { schema }
  );
  out.brandTables = tables.map(t => t.table_name);

  const cols = await q(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = :schema AND column_name = 'brandId' ORDER BY 1`,
    { schema }
  );
  out.brandIdColumns = cols.map(c => c.table_name);

  const meta = await q(
    `SELECT name FROM "${schema}"."SequelizeMeta"
      WHERE name LIKE '202608%' ORDER BY name`
  );
  out.migrations202608 = meta.map(m => m.name);

  const total = await q(
    `SELECT count(*)::int AS n FROM "${schema}"."SequelizeMeta"`
  );
  out.totalMigrations = total[0].n;

  const tickets = await q(
    `SELECT count(*)::int AS n FROM "${schema}"."Tickets"`
  );
  out.ticketCount = tickets[0].n;

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
"""


def main() -> int:
    ps = (
        f"$ErrorActionPreference='Continue'; Set-Location '{ROOT}\\backend'; "
        f"Set-Content -Path '.\\__schema_check.js' -Value @'\n{CHECK_JS}\n'@ -Encoding UTF8; "
        "node .\\__schema_check.js; "
        "Remove-Item '.\\__schema_check.js' -Force -EA SilentlyContinue"
    )

    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=120,
        read_timeout_sec=150,
    )
    result = session.run_ps(ps)
    print((result.std_out or b"").decode("utf-8", errors="replace").strip())
    err = (result.std_err or b"").decode("utf-8", errors="replace").strip()
    if err:
        print(err[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
