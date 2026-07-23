#!/usr/bin/env python3
"""Diagnose IIS bindings and proxy paths on VPS."""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip()

PS = r"""
Import-Module WebAdministration -EA SilentlyContinue
Write-Output '=== ALL WEBSITES ==='
Get-Website | ForEach-Object {
  $b = $_.bindings.Collection | ForEach-Object { $_.protocol + '://' + $_.bindingInformation }
  Write-Output ($_.name + ' | ' + $_.state + ' | ' + ($b -join ', '))
}
Write-Output '=== WEB.CONFIG PROD ==='
Get-Content 'C:\inetpub\ticketz-prod\web.config' -EA SilentlyContinue
Write-Output '=== PROCESSES ==='
Get-Process node,redis-server -EA SilentlyContinue | Select Name,Id
netstat -ano | findstr ':8080'
Write-Output '=== LOCAL TESTS ==='
foreach ($url in @(
  'http://127.0.0.1:8080/health',
  'http://127.0.0.1/health',
  'http://31.220.103.226/health'
)) {
  try {
    $r = Invoke-WebRequest $url -Headers @{Host='api.fortmax.com.br'} -UseBasicParsing -TimeoutSec 12
    Write-Output "$url => $($r.StatusCode)"
  } catch {
    Write-Output "$url => FAIL $($_.Exception.Message)"
  }
}
Write-Output '=== HTTPS TEST ==='
try {
  $r = Invoke-WebRequest 'https://127.0.0.1/health' -Headers @{Host='api.fortmax.com.br'} -UseBasicParsing -TimeoutSec 12 -SkipCertificateCheck
  Write-Output "https local => $($r.StatusCode)"
} catch {
  Write-Output "https local => FAIL $($_.Exception.Message)"
}
netstat -ano | findstr ':443 '
"""


def main() -> int:
    if not PASSWORD:
        print("CONTABO_PASSWORD required")
        return 1
    s = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=90,
        read_timeout_sec=120,
    )
    r = s.run_ps(PS)
    print((r.std_out or b"").decode("utf-8", errors="replace"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
