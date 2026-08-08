#!/usr/bin/env python3
"""Rollback do backend de HOMOLOGAÇÃO para o deploy anterior.

O deploy sobe um ZIP em `{DEPLOY_ROOT}\\deploy-cache\\ticketz-dist.zip` e
extrai em `{DEPLOY_ROOT}\\backend`. Antes de extrair, este fluxo guarda a
`dist` atual em `dist-previous`, então voltar é trocar as duas pastas e
reiniciar — sem rede, sem build, em segundos.

Rollback NÃO desfaz migration. Isso é deliberado: reverter schema com dado
gravado é mais arriscado do que conviver com colunas a mais. Todas as colunas
desta entrega são `allowNull`, então a versão anterior do código roda sobre o
schema novo sem alteração. Se precisar mesmo reverter o schema, use
`npx sequelize db:migrate:undo --name <migration>` conscientemente.

Uso:
    HOMOLOG_VPS_IP=... HOMOLOG_VPS_PASSWORD=... \\
    DEPLOY_ROOT='C:\\ticketz-homolog' SERVICE_NAME=TicketzBackendHomolog \\
    python3 scripts/homolog-rollback.py [--dry-run]
"""
import os
import sys

PRODUCTION_ROOT = r"C:\ticketz"
PRODUCTION_SERVICE = "TicketzBackend"


def resolve() -> dict:
    cfg = {
        "root": (os.environ.get("DEPLOY_ROOT") or r"C:\ticketz-homolog").rstrip(
            "\\"
        ),
        "service": os.environ.get("SERVICE_NAME") or "TicketzBackendHomolog",
    }

    # Este script para e substitui um backend inteiro. Nunca pode rodar contra
    # produção, nem por engano de variável.
    if cfg["root"].lower() == PRODUCTION_ROOT.lower():
        print("DEPLOY_ROOT é a raiz de PRODUÇÃO. Abortado.", file=sys.stderr)
        sys.exit(1)
    if cfg["service"] == PRODUCTION_SERVICE:
        print("SERVICE_NAME é o serviço de PRODUÇÃO. Abortado.", file=sys.stderr)
        sys.exit(1)

    return cfg


def build_script(cfg: dict) -> str:
    return f"""
$ErrorActionPreference = 'Stop'
$root    = '{cfg["root"]}'
$backend = "$root\\backend"
$service = '{cfg["service"]}'
$current = "$backend\\dist"
$previous = "$backend\\dist-previous"

if (-not (Test-Path $previous)) {{
  Write-Error "Nao ha versao anterior em $previous — rollback impossivel."
  exit 1
}}

Write-Output '=== SHA atual (antes do rollback) ==='
if (Test-Path "$current\\gitinfo.js") {{ Get-Content "$current\\gitinfo.js" | Select-String 'commitHash' }}

Write-Output '=== parando servico de homologacao ==='
$svc = Get-Service -Name $service -ErrorAction SilentlyContinue
if ($svc) {{ Stop-Service -Name $service -Force }} else {{ schtasks /End /TN $service 2>$null | Out-Null }}
Start-Sleep -Seconds 3

Write-Output '=== trocando dist por dist-previous ==='
$rollbackTmp = "$backend\\dist-rollback-tmp"
if (Test-Path $rollbackTmp) {{ Remove-Item $rollbackTmp -Recurse -Force }}
Move-Item $current $rollbackTmp
Move-Item $previous $current
Move-Item $rollbackTmp $previous

Write-Output '=== SHA apos rollback ==='
if (Test-Path "$current\\gitinfo.js") {{ Get-Content "$current\\gitinfo.js" | Select-String 'commitHash' }}

Write-Output '=== subindo servico ==='
if ($svc) {{ Start-Service -Name $service }} else {{ schtasks /Run /TN $service | Out-Null }}
Start-Sleep -Seconds 8

Write-Output '=== health ==='
try {{
  (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:{os.environ.get("BACKEND_PORT", "8090")}/health' -TimeoutSec 10).Content
}} catch {{ Write-Output "health ainda nao respondeu: $_" }}

Write-Output '=== producao intocada (conferencia) ==='
schtasks /Query /TN '{PRODUCTION_SERVICE}' /FO LIST 2>$null | Select-String 'TaskName|Status'
"""


def main() -> None:
    cfg = resolve()
    script = build_script(cfg)

    print("Rollback de HOMOLOGAÇÃO")
    print(f"  root    {cfg['root']}")
    print(f"  service {cfg['service']}")

    if "--dry-run" in sys.argv:
        print("\n--- PowerShell que seria executado ---")
        print(script)
        return

    host = (os.environ.get("HOMOLOG_VPS_IP") or "").strip()
    password = (os.environ.get("HOMOLOG_VPS_PASSWORD") or "").strip()
    if not host or not password:
        print(
            "HOMOLOG_VPS_IP e HOMOLOG_VPS_PASSWORD obrigatórios (ou --dry-run).",
            file=sys.stderr,
        )
        sys.exit(1)

    import winrm

    session = winrm.Session(
        f"https://{host}:5986/wsman",
        auth=("administrator", password),
        transport="ntlm",
        server_cert_validation="ignore",
    )
    result = session.run_ps(script)
    sys.stdout.write(result.std_out.decode("utf-8", "ignore"))
    if result.status_code != 0:
        sys.stderr.write(result.std_err.decode("utf-8", "ignore"))
        sys.exit(result.status_code)


if __name__ == "__main__":
    main()
