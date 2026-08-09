#!/usr/bin/env python3
"""Reinicia o backend na VPS — passo separado do upload.

Existe para que o deploy possa ser: upload → migration → restart.

Antes, `deploy-vps-backend.py` fazia upload e restart no mesmo passo, então o
backend novo subia ANTES da migration. Em 08/08 isso colocou em produção um
código que declarava `Tickets.brandId` sobre um schema que ainda não tinha a
coluna. Com os dois passos separados, uma migration que falha interrompe o
deploy com o backend ANTIGO ainda no ar — que é coerente com o schema antigo.

A lógica de parada, verificação e health continua em
`backend/scripts/restart-after-deploy.ps1`; aqui só a chamamos.
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
    skip_reset = os.environ.get("SKIP_WHATSAPP_RESET", "").lower() in (
        "1",
        "true",
        "yes",
    )
    switch = "-SkipWhatsAppReset" if skip_reset else ""

    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=300,
        read_timeout_sec=330,
    )

    print("Restart backend..." + (" (no WhatsApp reset)" if skip_reset else ""))
    result = session.run_ps(
        f"& '{ROOT}\\backend\\scripts\\restart-after-deploy.ps1' {switch}; "
        f"exit $LASTEXITCODE"
    )

    print((result.std_out or b"").decode("utf-8", errors="replace"))
    err = (result.std_err or b"").decode("utf-8", errors="replace").strip()
    if err:
        print(err[-2000:], file=sys.stderr)

    if result.status_code != 0:
        print("::error::Backend local health check failed after restart")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
