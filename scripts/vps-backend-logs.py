#!/usr/bin/env python3
"""Read VPS backend logs and process state."""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"

PS = r"""
$Root='C:\ticketz'
Write-Output '=== LISTEN 8080 ==='
netstat -ano | findstr 'LISTENING' | findstr ':8080'
Write-Output '=== BACKEND LOG (grep) ==='
Get-Content "$Root\logs\backend.log" -Tail 30 -EA SilentlyContinue | Select-String -Pattern 'listening|exit|Error|FAIL|started on port'
Write-Output '=== SCHEDULED TASKS ==='
schtasks /Query /TN TicketzBackend /FO LIST /V 2>&1 | Select-String 'Status|Last Result|Task To Run|Next Run'
schtasks /Query /TN TicketzRedis /FO LIST /V 2>&1 | Select-String 'Status|Last Result|Task To Run'
Write-Output '=== BACKEND LOG (tail) ==='
Get-Content "$Root\logs\backend.log" -Tail 60 -EA SilentlyContinue
Write-Output '=== BACKEND ERR (full tail) ==='
Get-Content "$Root\logs\backend.err.log" -Tail 80 -EA SilentlyContinue
"""


def main() -> int:
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
