#!/usr/bin/env python3
"""Rebuild backend on VPS, reset WhatsApp session, restart."""

import base64
import os
import sys

import winrm

PASSWORD = os.environ.get("CONTABO_PASSWORD", "")
HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WBOT = os.path.join(ROOT, "backend", "src", "libs", "wbot.ts")
RESET = os.path.join(ROOT, "backend", "scripts", "reset-whatsapp-session.js")
CHUNK = 4000


def session():
    return winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=300,
        read_timeout_sec=360,
    )


def run_ps(s, ps):
    r = s.run_ps(ps)
    out = (r.std_out or b"").decode("utf-8", errors="replace")
    return r.status_code, out


def upload_file(s, local_path, remote_path):
    with open(local_path, "rb") as f:
        data = f.read()
    b64 = base64.b64encode(data).decode("ascii")
    run_ps(s, f"Remove-Item '{remote_path}' -Force -ErrorAction SilentlyContinue")
    run_ps(s, f"Remove-Item '{remote_path}.b64' -Force -ErrorAction SilentlyContinue")
    for i in range(0, len(b64), CHUNK):
        chunk = b64[i : i + CHUNK].replace("'", "''")
        run_ps(s, f"Add-Content -Path '{remote_path}.b64' -Value '{chunk}' -NoNewline")
    code, out = run_ps(
        s,
        f"""
$bytes = [Convert]::FromBase64String((Get-Content '{remote_path}.b64' -Raw))
[IO.File]::WriteAllBytes('{remote_path}', $bytes)
Remove-Item '{remote_path}.b64' -Force
Write-Output "uploaded $($bytes.Length) bytes to {remote_path}"
""",
    )
    print(out.strip())
    return code == 0


def main():
    if not PASSWORD:
        print("CONTABO_PASSWORD required")
        return 1
    s = session()

    print("Uploading wbot.ts + reset script...")
    upload_file(s, WBOT, r"C:\ticketz\backend\src\libs\wbot.ts")
    upload_file(s, RESET, r"C:\ticketz\backend\scripts\reset-whatsapp-session.js")

    print("Fix run-backend.cmd logging...")
    run_ps(
        s,
        r"""
@'
@echo off
cd /d C:\ticketz\backend
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if not "%%a"=="" set "%%a=%%b"
)
node dist\server.js >> C:\ticketz\logs\backend.log 2>> C:\ticketz\logs\backend.err.log
'@ | Set-Content C:\ticketz\run-backend.cmd -Encoding ASCII
""",
    )

    print("Build + reset + restart...")
    code, out = run_ps(
        s,
        r"""
$ErrorActionPreference='Continue'
$Backend='C:\ticketz\backend'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

Get-Process node -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 3

Push-Location $Backend
npm run build 2>&1 | Select-Object -Last 15
node scripts/reset-whatsapp-session.js 1
Pop-Location

Start-ScheduledTask -TaskName TicketzBackend
Start-Sleep 55

try { Write-Output "health=$((Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20).Content)" } catch { Write-Output 'health fail' }
Get-Content C:\ticketz\logs\backend.log -Tail 12 -EA SilentlyContinue | Select-String 'QR|conflict|Central|WhatsApp'
""",
    )
    print(out)
    return 0 if code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
