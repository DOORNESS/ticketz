#!/usr/bin/env python3
"""Restart Ticketz on Contabo VPS (C:\\ticketz — processos .cmd, não Scheduled Tasks)."""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"

RESTART_PS = r"""
$ErrorActionPreference = 'Continue'
$Root = 'C:\ticketz'

Get-Process node -EA SilentlyContinue | Stop-Process -Force
Get-Process redis-server -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2

$redis = @(
  "$Root\start-redis.cmd",
  "$Root\run-redis.cmd"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($redis) {
  Start-Process $redis -WindowStyle Hidden
  Write-Output "redis started via $redis"
} else {
  Write-Output "redis script missing"
}

Start-Sleep 3

$backend = @(
  "$Root\start-backend.cmd",
  "$Root\run-backend.cmd"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($backend) {
  Start-Process $backend -WindowStyle Hidden
  Write-Output "backend started via $backend"
} else {
  Push-Location "$Root\backend"
  Start-Process node -ArgumentList 'dist\server.js' -WorkingDirectory "$Root\backend" -WindowStyle Hidden
  Pop-Location
  Write-Output 'backend started via node dist\server.js'
}

Start-Sleep 40
Get-Process node,redis-server -EA SilentlyContinue | Select-Object Name,Id
netstat -ano | findstr ':8080'
try {
  Write-Output "health=$((Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20).Content)"
} catch {
  Write-Output "health=FAIL $($_.Exception.Message)"
}
try {
  $r = Invoke-WebRequest 'http://127.0.0.1/health' -Headers @{Host='api.fortmax.com.br'} -UseBasicParsing -TimeoutSec 15
  Write-Output "iis_proxy=$($r.StatusCode) $($r.Content.Substring(0,[Math]::Min(120,$r.Content.Length)))"
} catch {
  Write-Output "iis_proxy=FAIL $($_.Exception.Message)"
}
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
    print(f"Restarting Ticketz on {HOST}...")
    r = s.run_ps(RESTART_PS)
    out = (r.std_out or b"").decode("utf-8", errors="replace")
    err = (r.std_err or b"").decode("utf-8", errors="replace")
    print(out)
    if err.strip():
        print(err[-1500:])
    return 0 if r.status_code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
