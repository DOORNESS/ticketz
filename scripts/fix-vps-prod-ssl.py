#!/usr/bin/env python3
"""Fix HTTPS SSL binding for TicketzProdApi (Cloudflare Full)."""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"

PS = r"""
$hostn = 'api.fortmax.com.br'
$site = 'TicketzProdApi'
Import-Module WebAdministration
$cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.DnsNameList.Unicode -contains $hostn } | Select-Object -First 1
if (-not $cert) {
  $cert = New-SelfSignedCertificate -DnsName $hostn -CertStoreLocation 'Cert:\LocalMachine\My' -NotAfter (Get-Date).AddYears(2)
}
if (-not (Get-WebBinding -Name $site -Protocol 'https' -HostHeader $hostn -EA SilentlyContinue)) {
  New-WebBinding -Name $site -Protocol 'https' -Port 443 -HostHeader $hostn -SslFlags 1
}
try { (Get-Item "IIS:\SslBindings\0.0.0.0!443!$hostn" -EA Stop).Delete() } catch {}
New-Item "IIS:\SslBindings\0.0.0.0!443!$hostn" -Value (Get-Item "Cert:\LocalMachine\My\$($cert.Thumbprint)") | Out-Null
Write-Output "thumb=$($cert.Thumbprint)"
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
    )
    r = s.run_ps(PS)
    print((r.std_out or b"").decode("utf-8", errors="replace"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
