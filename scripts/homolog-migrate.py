#!/usr/bin/env python3
"""Roda migrations no banco de HOMOLOGAÇÃO e reinicia o serviço de homologação.

Usa o `.env` que `write-homolog-env.py` acabou de escrever em
`{DEPLOY_ROOT}\\backend`, então a conexão é sempre a de homologação — não há
caminho por onde o banco de produção possa ser alcançado a partir daqui.

Uso (via workflow deploy-homolog.yml):
    python3 scripts/homolog-migrate.py
"""
import os
import sys

try:
    import winrm
except ImportError:  # pragma: no cover
    print("pywinrm não instalado", file=sys.stderr)
    sys.exit(1)


PRODUCTION_ROOT = r"C:\ticketz"
PRODUCTION_SERVICE = "TicketzBackend"

REQUIRED = ["CONTABO_HOST", "CONTABO_PASSWORD", "DEPLOY_ROOT", "SERVICE_NAME"]


def main() -> None:
    missing = [n for n in REQUIRED if not (os.environ.get(n) or "").strip()]
    if missing:
        print("Variáveis ausentes: " + ", ".join(missing), file=sys.stderr)
        sys.exit(1)

    host = os.environ["CONTABO_HOST"].strip()
    password = os.environ["CONTABO_PASSWORD"].strip()
    root = os.environ["DEPLOY_ROOT"].strip().rstrip("\\")
    service = os.environ["SERVICE_NAME"].strip()

    # Guards redundantes de propósito: este script roda comandos com efeito
    # destrutivo (migration + restart) e não deve depender só do workflow.
    if root.lower() == PRODUCTION_ROOT.lower():
        print("DEPLOY_ROOT é a raiz de PRODUÇÃO. Abortado.", file=sys.stderr)
        sys.exit(1)
    if service == PRODUCTION_SERVICE:
        print("SERVICE_NAME é o serviço de PRODUÇÃO. Abortado.", file=sys.stderr)
        sys.exit(1)

    backend = f"{root}\\backend"

    session = winrm.Session(
        f"https://{host}:5986/wsman",
        auth=("administrator", password),
        transport="ntlm",
        server_cert_validation="ignore",
    )

    ps = f"""
$ErrorActionPreference = 'Stop'
Set-Location '{backend}'

Write-Output '--- banco alvo (confirmação) ---'
Select-String -Path '{backend}\\.env' -Pattern '^DB_(HOST|NAME|SCHEMA)=' |
  ForEach-Object {{ $_.Line }}

Write-Output '--- migrations ---'
npx sequelize db:migrate

Write-Output '--- reiniciando {service} ---'
$svc = Get-Service -Name '{service}' -ErrorAction SilentlyContinue
if ($svc) {{
  Restart-Service -Name '{service}' -Force
  Write-Output ('serviço ' + $svc.Name + ' reiniciado')
}} else {{
  schtasks /End /TN '{service}' 2>$null | Out-Null
  schtasks /Run /TN '{service}' | Out-Null
  Write-Output 'tarefa agendada {service} reiniciada'
}}
"""
    result = session.run_ps(ps)
    sys.stdout.write(result.std_out.decode("utf-8", "ignore"))
    if result.status_code != 0:
        sys.stderr.write(result.std_err.decode("utf-8", "ignore"))
        sys.exit(result.status_code)


if __name__ == "__main__":
    main()
