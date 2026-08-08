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
    # A porta e explicita de proposito. Com host, base, usuario e senha vindo de
    # secret, deixar so a porta com default 5432 esconde justamente o campo que
    # muda em Postgres gerenciado com pooler (6543 no Supabase, por exemplo) —
    # e o sintoma seria "conexao recusada" em vez de "secret faltando".
    "HOMOLOG_DB_PORT",
    "HOMOLOG_DB_NAME",
    "HOMOLOG_DB_USER",
    "HOMOLOG_DB_PASS",
    "HOMOLOG_JWT_SECRET",
    "HOMOLOG_JWT_REFRESH_SECRET",
    # Redis e storage sao obrigatorios: sem instancia e bucket proprios,
    # homologacao compartilha filas, locks e objetos com producao.
    "HOMOLOG_REDIS_URI",
    "HOMOLOG_B2_BUCKET",
    "HOMOLOG_B2_KEY_ID",
    "HOMOLOG_B2_APPLICATION_KEY",
    "HOMOLOG_B2_ENDPOINT",
    # Valores de producao usados apenas para COMPARACAO, nunca para conectar.
    # Sao obrigatorios porque sao a unica evidencia de que o banco e o bucket
    # de homologacao nao sao os de producao: ausentes, as checagens abaixo
    # passariam sempre, dando uma garantia que nao existe.
    "PROD_DB_HOST_FRAGMENT",
    "PROD_B2_BUCKET",
]

PRODUCTION_ROOT = r"C:\ticketz"
PRODUCTION_REDIS_PORT = "6379"


def require_env() -> dict:
    missing = [name for name in REQUIRED if not (os.environ.get(name) or "").strip()]
    if missing:
        print(
            "Variáveis obrigatórias ausentes: " + ", ".join(missing),
            file=sys.stderr,
        )
        sys.exit(1)
    return {name: os.environ[name].strip() for name in REQUIRED}


def guard_not_production(cfg: dict) -> None:
    """Última barreira antes de escrever no disco da VPS.

    Repete verificações que o workflow já faz. É redundância proposital: este
    script escreve o arquivo que define a qual banco, fila e bucket o backend
    vai se conectar, e não deve depender de o chamador ter feito a checagem.
    """
    if cfg["DEPLOY_ROOT"].rstrip("\\").lower() == PRODUCTION_ROOT.lower():
        print(
            "DEPLOY_ROOT aponta para a raiz de PRODUÇÃO. Abortado.",
            file=sys.stderr,
        )
        sys.exit(1)

    # O .env escrito aqui e o que decide a qual banco o backend conecta. Se o
    # host de homologacao contem o fragmento do host de producao, e producao.
    if cfg["PROD_DB_HOST_FRAGMENT"] in cfg["HOMOLOG_DB_HOST"]:
        print(
            "HOMOLOG_DB_HOST aponta para o banco de PRODUÇÃO. Abortado.",
            file=sys.stderr,
        )
        sys.exit(1)

    redis_uri = cfg["HOMOLOG_REDIS_URI"]
    if f":{PRODUCTION_REDIS_PORT}" in redis_uri:
        print(
            f"HOMOLOG_REDIS_URI usa a porta {PRODUCTION_REDIS_PORT} "
            "(Redis de PRODUÇÃO). Abortado.",
            file=sys.stderr,
        )
        sys.exit(1)

    if cfg["HOMOLOG_B2_BUCKET"] == cfg["PROD_B2_BUCKET"]:
        print(
            "HOMOLOG_B2_BUCKET é o bucket de PRODUÇÃO. Abortado.",
            file=sys.stderr,
        )
        sys.exit(1)


def build_env(cfg: dict) -> str:
    optional = {
        # Vazios de proposito: sem chave, nao envia e-mail e a IA nao responde.
        # Preferimos homologacao muda a homologacao falando com cliente real.
        "OPENAI_API_KEY": os.environ.get("HOMOLOG_OPENAI_API_KEY", ""),
        "RESEND_API_KEY": os.environ.get("HOMOLOG_RESEND_API_KEY", ""),
        "ESCALATION_EMAIL_TO": os.environ.get("HOMOLOG_ESCALATION_EMAIL_TO", ""),
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
        f"DB_PORT={cfg['HOMOLOG_DB_PORT']}",
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
        # Instancia Redis exclusiva. Bull, cache, locks da IA e buffers leem
        # todos desta mesma URI (auditado: 10 consumidores, todos REDIS_URI).
        f"REDIS_URI={cfg['HOMOLOG_REDIS_URI']}",
        "",
        "STORAGE_PROVIDER=backblaze",
        f"B2_BUCKET={cfg['HOMOLOG_B2_BUCKET']}",
        f"B2_KEY_ID={cfg['HOMOLOG_B2_KEY_ID']}",
        f"B2_APPLICATION_KEY={cfg['HOMOLOG_B2_APPLICATION_KEY']}",
        f"B2_ENDPOINT={cfg['HOMOLOG_B2_ENDPOINT']}",
        "B2_USE_PRIVATE_ACCESS=true",
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
        f"RESEND_API_KEY={optional['RESEND_API_KEY']}",
        f"ESCALATION_EMAIL_TO={optional['ESCALATION_EMAIL_TO']}",
        "",
        # Marca o ambiente para a guarda de credenciais WhatsApp importadas.
        "ENVIRONMENT_NAME=homolog",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    cfg = require_env()
    guard_not_production(cfg)

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
