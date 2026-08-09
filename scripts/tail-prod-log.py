#!/usr/bin/env python3
"""Lê as últimas linhas do log do backend de produção (somente leitura).

Uso:
    python3 scripts/tail-prod-log.py [linhas] [padrao]

Exemplo:
    python3 scripts/tail-prod-log.py 200 annex
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


def main() -> int:
    lines = sys.argv[1] if len(sys.argv) > 1 else "150"
    pattern = sys.argv[2] if len(sys.argv) > 2 else ""

    grep = f" | Select-String -Pattern '{pattern}'" if pattern else ""
    ps = f"""
$ErrorActionPreference='Continue'
$logs = @(
  '{ROOT}\\backend\\logs',
  '{ROOT}\\logs',
  '{ROOT}'
) | Where-Object {{ Test-Path $_ }}

$file = Get-ChildItem -Path $logs -Filter *.log -Recurse -EA SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $file) {{ Write-Output 'NENHUM .log ENCONTRADO'; exit 0 }}
Write-Output "ARQUIVO: $($file.FullName)  (modificado $($file.LastWriteTime))"
Get-Content $file.FullName -Tail {lines}{grep}
"""

    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=120,
        read_timeout_sec=150,
    )
    result = session.run_ps(ps)
    print((result.std_out or b"").decode("utf-8", errors="replace"))
    err = (result.std_err or b"").decode("utf-8", errors="replace").strip()
    if err:
        print(err[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
