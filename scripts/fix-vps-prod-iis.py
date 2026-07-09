#!/usr/bin/env python3
"""Ensure TicketzProdApi IIS site is up and proxying to :8080."""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"

FIX_PS = r"""
$ErrorActionPreference = 'Continue'
$Root = 'C:\ticketz'
$prodDir = 'C:\inetpub\ticketz-prod'
New-Item -ItemType Directory -Force -Path $prodDir | Out-Null

@'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="TicketzProdProxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:8080/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
'@ | Set-Content "$prodDir\web.config" -Encoding UTF8

Import-Module WebAdministration -EA SilentlyContinue

if (-not (Get-Website -Name 'TicketzProdApi' -EA SilentlyContinue)) {
  New-Website -Name 'TicketzProdApi' -PhysicalPath $prodDir -Port 80 -HostHeader 'api.fortmax.com.br' -Force | Out-Null
  Write-Output 'created TicketzProdApi'
} else {
  Write-Output 'TicketzProdApi exists'
}

Start-Service W3SVC -EA SilentlyContinue
Start-Website -Name 'TicketzProdApi' -EA SilentlyContinue

# HTTPS para Cloudflare SSL Full (api.fortmax.com.br:443)
$hostn = 'api.fortmax.com.br'
$siteName = 'TicketzProdApi'
$cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.DnsNameList.Unicode -contains $hostn } | Select-Object -First 1
if (-not $cert) {
  $cert = New-SelfSignedCertificate -DnsName $hostn -CertStoreLocation 'Cert:\LocalMachine\My' -NotAfter (Get-Date).AddYears(2) -KeyExportPolicy Exportable
}
$thumb = $cert.Thumbprint
$httpsBinding = Get-WebBinding -Name $siteName -Protocol 'https' -HostHeader $hostn -EA SilentlyContinue
if (-not $httpsBinding) {
  New-WebBinding -Name $siteName -Protocol 'https' -Port 443 -HostHeader $hostn -SslFlags 1
}
try {
  (Get-Item "IIS:\SslBindings\0.0.0.0!443!$hostn" -EA Stop).Delete()
} catch {}
New-Item "IIS:\SslBindings\0.0.0.0!443!$hostn" -Value (Get-Item "Cert:\LocalMachine\My\$thumb") | Out-Null
Write-Output "ssl thumb=$thumb"

# Evita iisreset (derruba node); recicla só o site prod
Stop-Website -Name $siteName -EA SilentlyContinue
Start-Website -Name $siteName -EA SilentlyContinue

Write-Output '=== SITES ==='
Get-Website | Where-Object { $_.Name -match 'Ticketz|WebG3|migracao' } | Format-Table Name,State -AutoSize
Write-Output '=== PORT 80 ==='
netstat -ano | findstr ':80 '
Write-Output '=== ALL BINDINGS ==='
Get-Website | ForEach-Object {
  $b = $_.bindings.Collection | ForEach-Object { $_.protocol + '://' + $_.bindingInformation }
  Write-Output ($_.name + ' | ' + $_.state + ' | ' + ($b -join ', '))
}
Write-Output '=== TESTS ==='
try {
  Write-Output "8080=$((Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 15).StatusCode)"
} catch {
  Write-Output "8080=FAIL $($_.Exception.Message)"
}
try {
  $r = Invoke-WebRequest 'http://127.0.0.1/health' -Headers @{Host='api.fortmax.com.br'} -UseBasicParsing -TimeoutSec 15
  Write-Output "iis_proxy=$($r.StatusCode) $($r.Content.Substring(0,[Math]::Min(150,$r.Content.Length)))"
} catch {
  Write-Output "iis_proxy=FAIL $($_.Exception.Message)"
}
try {
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
  $r = Invoke-WebRequest 'https://127.0.0.1/health' -Headers @{Host='api.fortmax.com.br'} -UseBasicParsing -TimeoutSec 15
  Write-Output "iis_https_local=$($r.StatusCode) $($r.Content.Substring(0,[Math]::Min(150,$r.Content.Length)))"
} catch {
  Write-Output "iis_https_local=FAIL $($_.Exception.Message)"
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
    print(f"Fixing IIS on {HOST}...")
    r = s.run_ps(FIX_PS)
    out = (r.std_out or b"").decode("utf-8", errors="replace")
    err = (r.std_err or b"").decode("utf-8", errors="replace")
    print(out)
    if err.strip():
        print(err[-1500:])
    return 0 if r.status_code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
