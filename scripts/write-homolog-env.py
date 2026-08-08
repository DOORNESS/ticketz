#!/usr/bin/env python3
"""Escreve o .env de HOMOLOGAÇÃO na VPS.

O .env de homologação é gerado inteiramente a partir de secrets `HOMOLOG_*`.
Não existe fallback para nenhuma variável de produção: se um secret obrigatório
faltar, o script aborta antes de escrever qualquer coisa. Um .env pela metade
apontando para o banco errado é pior do que um deploy que falha.

Uso (via workflow deploy-homolog.yml):
    python3 scripts/write-homolog-env.py
"""
import os
import sys

try:
    import winrm
except ImportError:  # pragma: no cover
    print("pywinrm não instalado", file=sys.stderr)
    sys.exit(1)


REQUIRED = [
    "CONTABO_HOST",
    "CONTABO_PASSWORD",
    "DEPLOY_ROOT",
    "BACKEND_PORT",
    "HOMOLOG_DB_HOST",
    "HOMOLOG_DB_NAME",
    "HOMOLOG_DB_USER",
    "HOMOLOG_DB_PASS",
    "HOMOLOG_JWT_SECRET",
    "HOMOLOG_JWT_REFRESH_SECRET",
]

PRODUCTION_ROOT = r"C:\ticketz"


def require_env() -> dict:
    missing = [name for name in REQUIRED if not (os.environ.get(name) or "").strip()]
    if missing:
        print(
            "Variáveis obrigatórias ausentes: " + ", ".join(missing),
            file=sys.stderr,
        )
        sys.exit(1)
    return {name: os.environ[name].strip() for name in REQUIRED}


def guard_not_production(deploy_root: str) -> None:
    """Última barreira antes de escrever no disco da VPS."""
    normalized = deploy_root.rstrip("\\").lower()
    if normalized == PRODUCTION_ROOT.lower():
        print(
            "DEPLOY_ROOT aponta para a raiz de PRODUÇÃO. Abortado.",
            file=sys.stderr,
        )
        sys.exit(1)


def build_env(cfg: dict) -> str:
    optional = {
        "REDIS_URI": os.environ.get("HOMOLOG_REDIS_URI", "redis://127.0.0.1:6379"),
        "DB_PORT": os.environ.get("HOMOLOG_DB_PORT", "5432"),
        "OPENAI_API_KEY": os.environ.get("HOMOLOG_OPENAI_API_KEY", ""),
    }

    lines = [
        "# GERADO AUTOMATICAMENTE PELO deploy-homolog.yml — NÃO EDITAR À MÃO",
        "# Ambiente: HOMOLOGAÇÃO. Banco, porta e segredos são exclusivos.",
        "NODE_ENV=production",
        "TZ=America/Sao_Paulo",
        f"PORT={cfg['BACKEND_PORT']}",
        "HOST=127.0.0.1",
        "",
        "DB_DIALECT=postgres",
        f"DB_HOST={cfg['HOMOLOG_DB_HOST']}",
        f"DB_PORT={optional['DB_PORT']}",
        f"DB_NAME={cfg['HOMOLOG_DB_NAME']}",
        f"DB_USER={cfg['HOMOLOG_DB_USER']}",
        f"DB_PASS={cfg['HOMOLOG_DB_PASS']}",
        # Schema continua `ticketz`: o isolamento vem do banco separado, e
        # manter o schema evita as migrations que hardcodam `ticketz.`.
        "DB_SCHEMA=ticketz",
        "DB_SSL=true",
        "DB_SSL_REJECT_UNAUTHORIZED=false",
        "DB_TIMEZONE=-03:00",
        "",
        f"REDIS_URI={optional['REDIS_URI']}",
        "",
        f"JWT_SECRET={cfg['HOMOLOG_JWT_SECRET']}",
        f"JWT_REFRESH_SECRET={cfg['HOMOLOG_JWT_REFRESH_SECRET']}",
        "JWT_ACCESS_EXPIRES_IN=8h",
        "JWT_REFRESH_EXPIRES_IN=30d",
        "",
        # Migrations rodam por passo explícito do workflow, nunca na subida —
        # assim o log da migration fica visível e auditável.
        "AUTO_MIGRATE=false",
        "WHATSAPP_AUTO_START=false",
        "",
        f"OPENAI_API_KEY={optional['OPENAI_API_KEY']}",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    cfg = require_env()
    guard_not_production(cfg["DEPLOY_ROOT"])

    env_content = build_env(cfg)
    backend_dir = f"{cfg['DEPLOY_ROOT'].rstrip(chr(92))}\\backend"

    session = winrm.Session(
        f"https://{cfg['CONTABO_HOST']}:5986/wsman",
        auth=("administrator", cfg["CONTABO_PASSWORD"]),
        transport="ntlm",
        server_cert_validation="ignore",
    )

    import base64

    encoded = base64.b64encode(env_content.encode("utf-8")).decode("ascii")
    ps = f"""
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path '{backend_dir}' | Out-Null
$bytes = [Convert]::FromBase64String('{encoded}')
[IO.File]::WriteAllBytes('{backend_dir}\\.env', $bytes)
Write-Output ('env escrito em {backend_dir}\\.env (' + $bytes.Length + ' bytes)')
"""
    result = session.run_ps(ps)
    sys.stdout.write(result.std_out.decode("utf-8", "ignore"))
    if result.status_code != 0:
        sys.stderr.write(result.std_err.decode("utf-8", "ignore"))
        sys.exit(result.status_code)


if __name__ == "__main__":
    main()
