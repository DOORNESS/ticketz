#!/usr/bin/env python3
"""Fix missing PORT/HOST in VPS .env from backup and restart."""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"

PS = r"""
$Root = 'C:\ticketz'
$envFile = "$Root\backend\.env"
$backup = "$Root\.env-backend-vps"
if (Test-Path $backup) {
  Copy-Item $backup $envFile -Force
  Write-Output 'restored from .env-backend-vps'
}
$c = Get-Content $envFile -Raw -EA SilentlyContinue
if (-not $c) { Write-Output 'env missing'; exit 1 }
if ($c -notmatch '(?m)^PORT=') { $c = "PORT=8080`n" + $c }
if ($c -match '(?m)^HOST=') { $c = $c -replace '(?m)^HOST=.*','HOST=127.0.0.1' } else { $c = "HOST=127.0.0.1`n" + $c }
[System.IO.File]::WriteAllText($envFile, $c.TrimEnd() + "`n")
Copy-Item $envFile $backup -Force
Select-String -Path $envFile -Pattern '^(HOST|PORT)=' | ForEach-Object { $_.Line }

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

schtasks /Change /TN TicketzBackend /DISABLE 2>&1 | Out-Null
Get-Process node -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2
if (-not (Get-Process redis-server -EA SilentlyContinue)) {
  Start-Process "$Root\start-redis.cmd" -WindowStyle Hidden
  Start-Sleep 3
}
$watch = "$Root\start-backend-watch.cmd"
$plain = "$Root\start-backend.cmd"
$start = if (Test-Path $watch) { $watch } else { $plain }
Start-Process $start -WindowStyle Hidden
Start-Sleep 55
netstat -ano | findstr 'LISTENING' | findstr ':8080'
try {
  $h = (Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20).Content
  Write-Output "health=$($h.Substring(0,[Math]::Min(150,$h.Length)))"
} catch { Write-Output "health=FAIL $($_.Exception.Message)" }
try {
  $r = Invoke-WebRequest 'http://127.0.0.1/health' -Headers @{Host='api.fortmax.com.br'} -UseBasicParsing -TimeoutSec 15
  Write-Output "iis=$($r.StatusCode)"
} catch { Write-Output "iis=FAIL $($_.Exception.Message)" }

# HTTPS para Cloudflare (SSL Full)
Import-Module WebAdministration -EA SilentlyContinue
$hostn = 'api.fortmax.com.br'
$site = 'TicketzProdApi'
$cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.DnsNameList.Unicode -contains $hostn } | Select-Object -First 1
if (-not $cert) {
  $cert = New-SelfSignedCertificate -DnsName $hostn -CertStoreLocation 'Cert:\LocalMachine\My' -NotAfter (Get-Date).AddYears(2)
}
if (-not (Get-WebBinding -Name $site -Protocol 'https' -HostHeader $hostn -EA SilentlyContinue)) {
  New-WebBinding -Name $site -Protocol 'https' -Port 443 -HostHeader $hostn -SslFlags 1
}
try { (Get-Item "IIS:\SslBindings\0.0.0.0!443!$hostn" -EA Stop).Delete() } catch {}
New-Item "IIS:\SslBindings\0.0.0.0!443!$hostn" -Value (Get-Item "Cert:\LocalMachine\My\$($cert.Thumbprint)") | Out-Null
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
try {
  $r = Invoke-WebRequest "https://127.0.0.1/health" -Headers @{Host=$hostn} -UseBasicParsing -TimeoutSec 15
  Write-Output "https=$($r.StatusCode)"
} catch { Write-Output "https=FAIL $($_.Exception.Message)" }
"""


def main() -> int:
    s = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=120,
        read_timeout_sec=150,
    )
    r = s.run_ps(PS)
    print((r.std_out or b"").decode("utf-8", errors="replace"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
