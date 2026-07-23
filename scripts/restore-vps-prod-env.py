#!/usr/bin/env python3
"""Restore production .env on Contabo VPS and restart backend."""

import base64
import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"

PROD_ENV = """FRONTEND_URL=https://suporte.fortmax.com.br
BACKEND_URL=https://api.fortmax.com.br
HOST=127.0.0.1
PORT=8080
NODE_ENV=production
TZ=America/Sao_Paulo
DB_DIALECT=postgres
DB_HOST=aws-1-sa-east-1.pooler.supabase.com
DB_PORT=5432
DB_USER=postgres.tcwtpkadwrsbdvehsmfy
DB_PASS=y$QXZram5@w2JKE
DB_NAME=postgres
DB_SCHEMA=ticketz
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
DB_TIMEZONE=-03:00
DB_MAX_CONNECTIONS=3
DB_MIN_CONNECTIONS=0
DB_CONNECT_TIMEOUT=15000
DB_ACQUIRE=60000
REDIS_URI=redis://127.0.0.1:6379
REDIS_OPT_LIMITER_MAX=1
REDIS_OPT_LIMITER_DURATION=3000
USER_LIMIT=10000
CONNECTIONS_LIMIT=100000
CLOSED_SEND_BY_ME=true
VERIFY_TOKEN=ticketz
SOCKET_ADMIN=true
STORAGE_ROOT_PREFIX=suporte
AUTO_MIGRATE=true
JWT_SECRET=fortmax-ticketz-access-jwt-v1-7f3a9c2e8b1d4f6a0c5e9b2d7f1a4c8e
JWT_REFRESH_SECRET=fortmax-ticketz-refresh-jwt-v1-2b8d4f6a1c9e3b7d0f5a8c2e6b4d1f9a
JWT_ACCESS_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=30d
TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=0x4AAAAAADhSILt9PsBiVeID
TURNSTILE_SECRET_KEY=0x4AAAAAADhSIMRIuil81syEGDWePGiCHeE
AI_QUEUE_CONCURRENCY=15
AI_QUEUE_DEBOUNCE_MS=0
AI_QUEUE_MAX_ATTEMPTS=3
AI_QUEUE_BACKOFF_MS=1500
AI_QUEUE_CONGESTION_THRESHOLD=100
AI_PROVIDER_TIMEOUT_MS=45000
AI_PROVIDER_MAX_RETRIES=1
WHATSAPP_START_TIMEOUT_MS=90000
WHATSAPP_DEFER_START_MS=2000
WHATSAPP_AUTO_START=true
AI_REENGAGEMENT_ENABLED=true
AI_PROACTIVE_FOLLOWUP_ENABLED=true
AI_PROACTIVE_FOLLOWUP_MINUTES=5
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
"""

ENV_B64 = base64.b64encode(PROD_ENV.strip().encode()).decode()

RESTART_PS = f"""
$Root = 'C:\\ticketz'
$b64 = '{ENV_B64}'
[IO.File]::WriteAllBytes("$Root\\.env-backend-vps", [Convert]::FromBase64String($b64))
Copy-Item "$Root\\.env-backend-vps" "$Root\\backend\\.env" -Force
Write-Output 'env restored'

schtasks /Change /TN TicketzBackend /DISABLE 2>&1 | Out-Null
Get-Process node -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2
Start-Process "$Root\\start-redis.cmd" -WindowStyle Hidden
Start-Sleep 3
if (Test-Path "$Root\\backend\\scripts\\apply-db-schema.js") {{
  Push-Location "$Root\\backend"
  node scripts\\apply-db-schema.js 2>&1
  Pop-Location
}}
Start-Process "$Root\\start-backend-watch.cmd" -WindowStyle Hidden
Start-Sleep 55
netstat -ano | findstr 'LISTENING' | findstr ':8080'
try {{
  Write-Output "health=$((Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20).Content.Substring(0,150))"
}} catch {{
  Write-Output "health=FAIL $($_.Exception.Message)"
}}
"""


def main() -> int:
    s = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=(USER, PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=120,
        read_timeout_sec=150,
    )
    print(f"Restoring production env on {HOST}...")
    r = s.run_ps(RESTART_PS)
    out = (r.std_out or b"").decode("utf-8", errors="replace")
    err = (r.std_err or b"").decode("utf-8", errors="replace")
    print(out)
    if err.strip():
        print(err[-1500:])
    return 0 if r.status_code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
