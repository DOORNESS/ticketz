#!/usr/bin/env python3
"""Ensure TicketzProdApi IIS site is up and proxying to :8080 (short WinRM steps)."""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"

STEPS = [
    (
        "webconfig",
        r"""
$d = 'C:\inetpub\ticketz-prod'
New-Item -ItemType Directory -Force -Path $d | Out-Null
$x = @'
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
'@
Set-Content "$d\web.config" $x -Encoding UTF8
Write-Output 'web.config ok'
""",
    ),
    (
        "site",
        r"""
Import-Module WebAdministration -EA SilentlyContinue
$site = 'TicketzProdApi'
$dir = 'C:\inetpub\ticketz-prod'
$hostn = 'api.fortmax.com.br'
if (-not (Get-Website -Name $site -EA SilentlyContinue)) {
  New-Website -Name $site -PhysicalPath $dir -Port 80 -HostHeader $hostn -Force | Out-Null
  Write-Output 'site created'
} else {
  Write-Output 'site exists'
}
Start-Service W3SVC -EA SilentlyContinue
Start-Website -Name $site -EA SilentlyContinue
Write-Output ((Get-Website -Name $site).State)
""",
    ),
    (
        "test",
        r"""
try {
  $r = Invoke-WebRequest 'http://127.0.0.1/health' -Headers @{Host='api.fortmax.com.br'} -UseBasicParsing -TimeoutSec 15
  Write-Output "iis=$($r.StatusCode)"
} catch {
  Write-Output "iis=FAIL $($_.Exception.Message)"
}
""",
    ),
]


def main() -> int:
    s = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=(USER, PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=90,
        read_timeout_sec=120,
    )
    print(f"Fixing IIS on {HOST}...")
    ok = True
    for name, ps in STEPS:
        print(f"\n=== {name} ===")
        r = s.run_ps(ps)
        out = (r.std_out or b"").decode("utf-8", errors="replace").strip()
        print(out)
        if r.status_code != 0:
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
