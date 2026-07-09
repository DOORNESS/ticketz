#!/usr/bin/env python3
"""Fix PORT/HOST/Turnstile in VPS .env and restart backend (short WinRM steps)."""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"

STEPS = [
    (
        "env",
        r"""
$Root = 'C:\ticketz'
$envFile = "$Root\backend\.env"
$backup = "$Root\.env-backend-vps"
if (Test-Path $backup) { Copy-Item $backup $envFile -Force }
$c = Get-Content $envFile -Raw -EA SilentlyContinue
if (-not $c) { Write-Output 'env missing'; exit 1 }
if ($c -notmatch '(?m)^PORT=') { $c = "PORT=8080`n" + $c }
if ($c -match '(?m)^HOST=') { $c = $c -replace '(?m)^HOST=.*','HOST=127.0.0.1' } else { $c = "HOST=127.0.0.1`n" + $c }
if ($c -notmatch '(?m)^TURNSTILE_ENABLED=') { $c += "`nTURNSTILE_ENABLED=true`n" }
if ($c -notmatch '(?m)^TURNSTILE_SITE_KEY=') { $c += "TURNSTILE_SITE_KEY=0x4AAAAAADhSILt9PsBiVeID`n" }
if ($c -notmatch '(?m)^TURNSTILE_SECRET_KEY=') { $c += "TURNSTILE_SECRET_KEY=0x4AAAAAADhSIMRIuil81syEGDWePGiCHeE`n" }
[System.IO.File]::WriteAllText($envFile, $c.TrimEnd() + "`n")
Copy-Item $envFile $backup -Force
Select-String -Path $envFile -Pattern '^(HOST|PORT|TURNSTILE_)' | ForEach-Object { $_.Line }
""",
    ),
    (
        "start-scripts",
        r"""
$Root = 'C:\ticketz'
@'
@echo off
cd /d C:\ticketz\backend
set HOST=127.0.0.1
set PORT=8080
node dist\server.js
'@ | Set-Content "$Root\start-backend.cmd" -Encoding ASCII
@'
@echo off
cd /d C:\ticketz\backend
set HOST=127.0.0.1
set PORT=8080
:loop
node dist\server.js 1>> ..\logs\backend.log 2>> ..\logs\backend.err.log
timeout /t 5 /nobreak >nul
goto loop
'@ | Set-Content "$Root\start-backend-watch.cmd" -Encoding ASCII
Write-Output 'start scripts ok'
""",
    ),
    (
        "restart",
        r"""
$Root = 'C:\ticketz'
schtasks /Change /TN TicketzBackend /DISABLE 2>&1 | Out-Null
Get-Process node -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2
if (-not (Get-Process redis-server -EA SilentlyContinue)) {
  Start-Process "$Root\start-redis.cmd" -WindowStyle Hidden
  Start-Sleep 3
}
Start-Process "$Root\start-backend-watch.cmd" -WindowStyle Hidden
Start-Sleep 50
try {
  $h = (Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20).Content
  Write-Output "health=$($h.Substring(0,[Math]::Min(120,$h.Length)))"
} catch { Write-Output "health=FAIL" }
""",
    ),
]


def main() -> int:
    s = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=120,
        read_timeout_sec=150,
    )
    for name, ps in STEPS:
        print(f"\n=== {name} ===")
        r = s.run_ps(ps)
        print((r.std_out or b"").decode("utf-8", errors="replace").strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
