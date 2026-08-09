#!/usr/bin/env python3
"""Executa um comando de marcas no backend de produção, via WinRM.

Uso:
    python3 scripts/run-prod-brand-command.py backfill
    python3 scripts/run-prod-brand-command.py audit
    python3 scripts/run-prod-brand-command.py isolation-status

`audit` e `isolation-status` são somente leitura. `backfill` só preenche
vínculo que está nulo — nunca sobrescreve vínculo definido pelo admin.
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
COMPANY_ID = os.environ.get("COMPANY_ID", "1")

COMMANDS = {
    "backfill": "node dist/scripts/backfillBrands.js",
    "audit": "node dist/scripts/auditBrands.js",
    "isolation-status": "node dist/scripts/toggleBrandIsolation.js status",
    "isolation-enable": "node dist/scripts/toggleBrandIsolation.js enable",
    "isolation-disable": "node dist/scripts/toggleBrandIsolation.js disable",
}


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(f"Uso: {sys.argv[0]} [{' | '.join(COMMANDS)}]", file=sys.stderr)
        return 2

    action = sys.argv[1]
    ps = (
        f"$ErrorActionPreference='Continue'; Set-Location '{ROOT}\\backend'; "
        f"$env:COMPANY_ID='{COMPANY_ID}'; "
        f"{COMMANDS[action]}; "
        "Write-Output \"EXITCODE=$LASTEXITCODE\""
    )

    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=300,
        read_timeout_sec=330,
    )
    result = session.run_ps(ps)
    print((result.std_out or b"").decode("utf-8", errors="replace").strip())
    err = (result.std_err or b"").decode("utf-8", errors="replace").strip()
    if err:
        print(err[-3000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
