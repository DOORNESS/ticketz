#!/usr/bin/env python3
"""Configure Resend escalation env vars on Contabo VPS backend .env."""

import base64
import os
import secrets
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip()
if not PASSWORD:
    raise SystemExit(
        "CONTABO_PASSWORD nao definido. A senha da VPS ficava hardcoded aqui "
        "como fallback, num repositorio publico. Defina a variavel de ambiente."
    )

ESCALATION_KEYS = [
    "RESEND_API_KEY",
    "SEND_EMAIL_HOOK_SECRET",
    "ESCALATION_EMAIL_FROM",
    "ESCALATION_EMAIL_TO",
    "ESCALATION_EMAIL_ENABLED",
    "BACKEND_URL",
]


def build_escalation_block() -> str:
    resend_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    hook_secret = (os.environ.get("SEND_EMAIL_HOOK_SECRET") or "").strip()
    if not resend_key:
        raise SystemExit("RESEND_API_KEY is required")
    if not hook_secret:
        hook_secret = secrets.token_hex(32)

    values = {
        "RESEND_API_KEY": resend_key,
        "SEND_EMAIL_HOOK_SECRET": hook_secret,
        "ESCALATION_EMAIL_FROM": (
            os.environ.get("ESCALATION_EMAIL_FROM") or "aviso@emails.doorness.com"
        ).strip(),
        "ESCALATION_EMAIL_TO": (
            os.environ.get("ESCALATION_EMAIL_TO") or "fernandofortmax@gmail.com"
        ).strip(),
        "ESCALATION_EMAIL_ENABLED": (
            os.environ.get("ESCALATION_EMAIL_ENABLED") or "true"
        ).strip(),
        "BACKEND_URL": (
            os.environ.get("BACKEND_URL") or "https://api.fortmax.com.br"
        ).strip(),
    }

    return "\n".join(f"{key}={values[key]}" for key in ESCALATION_KEYS)


def main() -> int:
    block = build_escalation_block()
    b64 = base64.b64encode(block.encode()).decode()
    keys_ps = ", ".join(f"'{key}'" for key in ESCALATION_KEYS)

    ps = f"""
$Root = 'C:\\ticketz'
$EnvFile = "$Root\\backend\\.env"
if (-not (Test-Path $EnvFile)) {{ Write-Error 'backend/.env not found'; exit 1 }}
$content = Get-Content $EnvFile -Raw
$keys = @({keys_ps})
foreach ($k in $keys) {{
  $content = ($content -split "`n" | Where-Object {{ $_ -notmatch "^$k=" }}) -join "`n"
}}
$block = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{b64}'))
$content = ($content.TrimEnd() + "`n" + $block + "`n")
Set-Content -Path $EnvFile -Value $content -Encoding UTF8
Copy-Item $EnvFile "$Root\.env-backend-vps" -Force
Write-Output 'Escalation env vars written (values not echoed)'

Push-Location "$Root\\backend"
if (Test-Path "dist\\services\\MigrationServices\\MigrationService.js") {{
  Write-Output 'Running pending migrations...'
  node -e "require('./dist/bootstrap'); require('./dist/database'); require('./dist/services/MigrationServices/MigrationService').runPendingMigrations().then((applied) => {{ console.log(JSON.stringify({{ ok: true, applied }})); process.exit(0); }}).catch((err) => {{ console.error(err); process.exit(1); }});" 2>&1
}}
Pop-Location

Get-Process node -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2
$backendCmd = @(
  "$Root\\backend\\scripts\\start-production.cmd",
  "$Root\\start-backend-watch.cmd",
  "$Root\\start-backend.cmd"
) | Where-Object {{ Test-Path $_ }} | Select-Object -First 1
if ($backendCmd) {{
  Start-Process $backendCmd -WindowStyle Hidden
}} else {{
  Start-Process node -ArgumentList "--max-old-space-size=4096","dist\\server.js" -WorkingDirectory "$Root\\backend" -WindowStyle Hidden
}}
Start-Sleep 45
try {{
  $h = Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20
  Write-Output "health=$($h.Content.Substring(0, [Math]::Min(160, $h.Content.Length)))"
}} catch {{
  Write-Output "health=FAIL $($_.Exception.Message)"
}}
"""

    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=(USER, PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=180,
        read_timeout_sec=210,
    )
    print(f"Applying escalation env on {HOST}...")
    result = session.run_ps(ps)
    out = (result.std_out or b"").decode("utf-8", errors="replace")
    err = (result.std_err or b"").decode("utf-8", errors="replace")
    print(out)
    if err.strip():
        print(err[-2000:])
    return 0 if result.status_code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
