#!/usr/bin/env python3
"""Provisiona a HOMOLOGAÇÃO na VPS: diretório, serviço, porta e site IIS.

Roda UMA vez, à mão, antes do primeiro deploy. O workflow não chama este
script — provisionamento é operação consciente, não efeito colateral de um
push.

Não toca em nada de produção: só cria recursos com nomes/caminhos exclusivos
de homologação e aborta se algum deles coincidir com os de produção.

Uso:
    HOMOLOG_VPS_IP=... HOMOLOG_VPS_PASSWORD=... \\
    python3 scripts/provision-vps-homolog.py

Opcionais: DEPLOY_ROOT, SERVICE_NAME, BACKEND_PORT, API_HOST, IIS_SITE.
Use --dry-run para só imprimir o que seria executado.
"""
import os
import sys

PRODUCTION = {
    "root": r"C:\ticketz",
    "service": "TicketzBackend",
    "site": "ticketz-prod",
    "api_host": "api.fortmax.com.br",
    "port": "8080",
    "redis_port": "6379",
}

DEFAULTS = {
    "root": r"C:\ticketz-homolog",
    "service": "TicketzBackendHomolog",
    "site": "ticketz-homolog",
    "api_host": "api-homolog.fortmax.com.br",
    "port": "8090",
    # Instancia Redis propria. Database separado nao serviria: o pub/sub do
    # Redis ignora o numero do database e os eventos do Bull cruzariam.
    "redis_port": "6380",
}


def resolve_config() -> dict:
    cfg = {
        "root": (os.environ.get("DEPLOY_ROOT") or DEFAULTS["root"]).rstrip("\\"),
        "service": os.environ.get("SERVICE_NAME") or DEFAULTS["service"],
        "site": os.environ.get("IIS_SITE") or DEFAULTS["site"],
        "api_host": os.environ.get("API_HOST") or DEFAULTS["api_host"],
        "port": os.environ.get("BACKEND_PORT") or DEFAULTS["port"],
        "redis_port": os.environ.get("HOMOLOG_REDIS_PORT")
        or DEFAULTS["redis_port"],
    }

    clashes = [
        key
        for key, value in cfg.items()
        if str(value).lower() == str(PRODUCTION[key]).lower()
    ]
    if clashes:
        print(
            "Configuração coincide com PRODUÇÃO em: " + ", ".join(clashes),
            file=sys.stderr,
        )
        sys.exit(1)

    return cfg


def build_script(cfg: dict) -> str:
    """PowerShell idempotente: rodar duas vezes não duplica nada."""
    return f"""
$ErrorActionPreference = 'Stop'

$root    = '{cfg["root"]}'
$backend = "$root\\backend"
$service = '{cfg["service"]}'
$site    = '{cfg["site"]}'
$port    = '{cfg["port"]}'
$apiHost = '{cfg["api_host"]}'
$redisPort = '{cfg["redis_port"]}'

Write-Output '=== 1. Diretórios de homologação ==='
foreach ($d in @($root, $backend, "$root\\deploy-cache", "$root\\dc")) {{
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}}
Write-Output "criado: $root"

Write-Output '=== 2. Script de start (porta exclusiva) ==='
$startCmd = "$root\\start-backend-homolog.cmd"
@"
@echo off
cd /d $backend
set NODE_ENV=production
node dist\\server.js
"@ | Set-Content -Path $startCmd -Encoding ASCII
Write-Output "criado: $startCmd"

Write-Output '=== 3. Tarefa agendada exclusiva ==='
schtasks /Query /TN $service 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {{
  schtasks /Create /TN $service /TR "cmd /c $startCmd" /SC ONSTART /RU SYSTEM /RL HIGHEST /F /DELAY 0000:45 | Out-Null
  Write-Output "tarefa criada: $service"
}} else {{
  Write-Output "tarefa já existe: $service"
}}

Write-Output '=== 3b. Redis exclusivo de homologação ==='
$redisSrc = 'C:\\ticketz\\redis'
$redisDst = "$root\\redis"
if (Test-Path $redisSrc) {{
  New-Item -ItemType Directory -Force -Path $redisDst | Out-Null
  Copy-Item "$redisSrc\\*" $redisDst -Recurse -Force -ErrorAction SilentlyContinue
  # Config propria: porta 6380 e arquivo de dump separado, para os dois Redis
  # nunca compartilharem keyspace nem persistencia.
  @"
port $redisPort
bind 127.0.0.1
dir $redisDst
dbfilename homolog.rdb
appendonly no
"@ | Set-Content -Path "$redisDst\\redis-homolog.conf" -Encoding ASCII

  @"
@echo off
cd /d $redisDst
redis-server.exe redis-homolog.conf
"@ | Set-Content -Path "$root\\start-redis-homolog.cmd" -Encoding ASCII

  schtasks /Query /TN 'TicketzRedisHomolog' 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {{
    schtasks /Create /TN 'TicketzRedisHomolog' /TR "cmd /c $root\\start-redis-homolog.cmd" /SC ONSTART /RU SYSTEM /RL HIGHEST /F | Out-Null
    Write-Output "tarefa criada: TicketzRedisHomolog (porta $redisPort)"
  }} else {{
    Write-Output 'tarefa TicketzRedisHomolog ja existe'
  }}
}} else {{
  Write-Output "AVISO: $redisSrc nao encontrado — instale o Redis de homologacao manualmente na porta $redisPort"
}}

Write-Output '=== 4. Site IIS de homologação ==='
Import-Module WebAdministration -ErrorAction SilentlyContinue
$iisPath = "C:\\inetpub\\$site"
New-Item -ItemType Directory -Force -Path $iisPath | Out-Null

@"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ProxyToHomologBackend" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:$port/{{R:1}}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
"@ | Set-Content -Path "$iisPath\\web.config" -Encoding UTF8

if (-not (Get-Website -Name $site -ErrorAction SilentlyContinue)) {{
  New-Website -Name $site -PhysicalPath $iisPath -Port 80 -HostHeader $apiHost -Force | Out-Null
  Write-Output "site IIS criado: $site → $apiHost (proxy 127.0.0.1:$port)"
}} else {{
  Write-Output "site IIS já existe: $site"
}}

Write-Output '=== 5. Conferência: produção intocada ==='
Get-Website | Select-Object Name, State, @{{n='Bindings';e={{($_.bindings.Collection | ForEach-Object {{ $_.bindingInformation }}) -join ', '}}}} | Format-Table -AutoSize | Out-String
schtasks /Query /TN 'TicketzBackend' /FO LIST 2>$null | Select-String 'TaskName|Status'
"""


def main() -> None:
    cfg = resolve_config()
    script = build_script(cfg)

    print("Provisionamento de HOMOLOGAÇÃO")
    for key, value in cfg.items():
        print(f"  {key:10} {value}")
    print(f"  {'prod root':10} {PRODUCTION['root']} (não será tocado)")

    if "--dry-run" in sys.argv:
        print("\n--- PowerShell que seria executado ---")
        print(script)
        return

    host = (os.environ.get("HOMOLOG_VPS_IP") or "").strip()
    password = (os.environ.get("HOMOLOG_VPS_PASSWORD") or "").strip()
    if not host or not password:
        print(
            "HOMOLOG_VPS_IP e HOMOLOG_VPS_PASSWORD são obrigatórios "
            "(ou use --dry-run).",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        import winrm
    except ImportError:
        print("pywinrm não instalado: pip install pywinrm", file=sys.stderr)
        sys.exit(1)

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
