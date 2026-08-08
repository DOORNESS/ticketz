#!/usr/bin/env python3
"""Aplica migrations pendentes no backend de produção, via WinRM.

Por que este passo existe
-------------------------
Até aqui o pipeline de produção nunca aplicou migration: `deploy-prod.yml` não
tinha passo de banco, e `AUTO_MIGRATE=true` só dispara `applyAiSchema()`, que é
um script fixo do schema de IA — não roda migration arbitrária. Na prática o
schema era atualizado à mão na VPS (`npm run build && npm run db:migrate`,
conforme `docs/AI_PHASE34_ROLLOUT_RUNBOOK.md`).

Isso funcionou enquanto código e schema podiam andar separados. Deixou de
funcionar com a entrega multimarcas: `models/Ticket.js` passa a declarar
`brandId` e a associação com `Brand`, então subir o código sem a migration
derruba qualquer consulta a Ticket. O passo de banco vira parte do deploy.

Ordem no workflow
-----------------
Roda DEPOIS de "Deploy backend na VPS Contabo" (precisa do `dist/` novo, que é
de onde o `.sequelizerc` lê a config) e ANTES de "Corrigir .env PORT/HOST", que
já reinicia o backend. Assim o processo que passa a servir tráfego é o primeiro
a enxergar o schema novo.

Se a migration falhar, o passo falha e o deploy para: melhor abortar com o
backend antigo no ar do que seguir com código novo sobre schema velho.
"""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"
ROOT = os.environ.get("DEPLOY_ROOT", r"C:\ticketz")

MIGRATE_PS = rf"""
$ErrorActionPreference = 'Stop'
Set-Location '{ROOT}\backend'

Write-Output '=== migrations pendentes antes ==='
npx sequelize db:migrate:status 2>&1 | Select-String '^down' | ForEach-Object {{ $_.Line }}

Write-Output '=== aplicando ==='
npx sequelize db:migrate 2>&1 | ForEach-Object {{ $_ }}
if ($LASTEXITCODE -ne 0) {{
  Write-Error "db:migrate falhou com codigo $LASTEXITCODE"
  exit 1
}}

Write-Output '=== pendentes depois (deve ser vazio) ==='
npx sequelize db:migrate:status 2>&1 | Select-String '^down' | ForEach-Object {{ $_.Line }}
exit 0
"""


def main() -> int:
    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=300,
        read_timeout_sec=330,
    )

    result = session.run_ps(MIGRATE_PS)
    out = (result.std_out or b"").decode("utf-8", errors="replace").strip()
    err = (result.std_err or b"").decode("utf-8", errors="replace").strip()

    if out:
        print(out)
    if err:
        print(err[-4000:], file=sys.stderr)

    if result.status_code != 0:
        print("::error::Migrations falharam na VPS — deploy interrompido")
        return 1

    print("Migrations aplicadas com sucesso.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
