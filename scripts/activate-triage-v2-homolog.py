#!/usr/bin/env python3
"""Ativa Triagem IA v2 em homolog (Contabo VPS) sem push para main."""

import base64
import os
import sys
from pathlib import Path

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"
COMPANY_ID = os.environ.get("TRIAGE_TEST_COMPANY_ID", "1")
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def session():
    endpoint = f"https://{HOST}:5986/wsman"
    print(f"WinRM target: {endpoint}")
    return winrm.Session(
        endpoint,
        auth=(USER, PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=3600,
        read_timeout_sec=3900,
    )


def upload_file(s, local_path: Path, remote_path: str) -> None:
    data = local_path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    b64_path = f"{remote_path}.b64"
    tmp_path = f"{remote_path}.new"
    chunk = 2000

    s.run_ps(
        f"""
Remove-Item '{b64_path}' -Force -ErrorAction SilentlyContinue
Remove-Item '{tmp_path}' -Force -ErrorAction SilentlyContinue
"""
    )

    for i in range(0, len(b64), chunk):
        part = b64[i : i + chunk].replace("'", "''")
        run_ps(
            s,
            f"Add-Content -Path '{b64_path}' -Value '{part}' -NoNewline -Encoding ASCII",
        )

    run_ps(
        s,
        f"""
$b64raw = Get-Content '{b64_path}' -Raw
$bytes = [Convert]::FromBase64String($b64raw)
[IO.File]::WriteAllBytes('{tmp_path}', $bytes)
Copy-Item '{tmp_path}' '{remote_path}' -Force
Remove-Item '{b64_path}' -Force
Remove-Item '{tmp_path}' -Force
Write-Output 'uploaded {local_path.name}'
""",
    )


def run_ps(s, ps):
    r = s.run_ps(ps)
    out = (r.std_out or b"").decode("utf-8", errors="replace")
    err = (r.std_err or b"").decode("utf-8", errors="replace")
    return r.status_code, out, err


def main() -> int:
    scripts = [
        "apply-triage-v2-schema.js",
        "validate-triage-v2-schema.js",
        "enable-triage-v2-company.js",
    ]

    for name in scripts:
        path = BACKEND / "scripts" / name
        if not path.is_file():
            print(f"Missing {path} — run npm run build first")
            return 1

    s = session()

    for name in scripts:
        upload_file(s, BACKEND / "scripts" / name, f"C:\\ticketz\\backend\\scripts\\{name}")

    ps = f"""
$Root='C:\\ticketz'
$envPath="$Root\\backend\\.env"
if (-not (Test-Path $envPath)) {{ throw "missing env file $envPath" }}
$content = Get-Content $envPath -Raw
if ($content -notmatch 'AI_TRIAGE_V2_ENABLED=') {{
  Add-Content $envPath "`nAI_TRIAGE_V2_ENABLED=true"
}} else {{
  $content = $content -replace 'AI_TRIAGE_V2_ENABLED=.*', 'AI_TRIAGE_V2_ENABLED=true'
  Set-Content $envPath $content
}}
Write-Output 'env AI_TRIAGE_V2_ENABLED=true'

Get-Process node -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2
Start-Process "$Root\\start-redis.cmd" -WindowStyle Hidden
Start-Sleep 3
Push-Location "$Root\\backend"
node scripts\\apply-triage-v2-schema.js 2>&1
node scripts\\validate-triage-v2-schema.js 2>&1
$env:COMPANY_ID='{COMPANY_ID}'
node scripts\\enable-triage-v2-company.js 2>&1
Pop-Location
Start-Process "$Root\\start-backend.cmd" -WindowStyle Hidden
Start-Sleep 45
try {{
  $h = Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20
  Write-Output "health=$($h.Content)"
}} catch {{ Write-Output "health fail $($_.Exception.Message)"; exit 1 }}
"""
    code, out, err = run_ps(s, ps)
    print(out)
    if err.strip():
        print(err[-3000:])
    return 0 if code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
