#!/usr/bin/env python3
"""Append Backblaze B2 vars to VPS backend .env from local environment."""

import base64
import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"

B2_KEYS = [
    ("STORAGE_PROVIDER", "storageProvider", "backblaze"),
    ("B2_APPLICATION_KEY_ID", "B2_APPLICATION_KEY_ID", None),
    ("B2_APPLICATION_KEY", "B2_APPLICATION_KEY", None),
    ("B2_BUCKET", "B2_BUCKET", None),
    ("B2_BUCKET_NAME", "B2_BUCKET_NAME", None),
    ("B2_ENDPOINT", "B2_ENDPOINT", None),
    ("B2_PUBLIC_URL", "B2_PUBLIC_URL", None),
]


def build_b2_block() -> str:
    lines = []
    for env_name, _, default in B2_KEYS:
        value = (os.environ.get(env_name) or default or "").strip()
        if value:
            lines.append(f"{env_name}={value}")
    return "\n".join(lines)


def main() -> int:
    block = build_b2_block()
    if not block:
        print(
            "Missing B2 env vars. Export before running:\n"
            "  B2_APPLICATION_KEY_ID\n"
            "  B2_APPLICATION_KEY\n"
            "  B2_BUCKET (or B2_BUCKET_NAME)\n"
            "  B2_ENDPOINT\n"
            "  B2_PUBLIC_URL (optional but recommended)"
        )
        return 1

    required = ["B2_APPLICATION_KEY_ID", "B2_APPLICATION_KEY", "B2_ENDPOINT"]
    bucket = os.environ.get("B2_BUCKET") or os.environ.get("B2_BUCKET_NAME")
    if not bucket:
        print("B2_BUCKET or B2_BUCKET_NAME is required")
        return 1

    missing = [k for k in required if not os.environ.get(k, "").strip()]
    if missing:
        print(f"Missing required vars: {', '.join(missing)}")
        return 1

    b64 = base64.b64encode(block.encode()).decode()
    ps = f"""
$Root = 'C:\\ticketz'
$EnvFile = "$Root\\backend\\.env"
if (-not (Test-Path $EnvFile)) {{ Write-Error 'backend/.env not found'; exit 1 }}
$content = Get-Content $EnvFile -Raw
$keys = @({', '.join(f"'{k[0]}'" for k in B2_KEYS)})
foreach ($k in $keys) {{
  $content = ($content -split "`n" | Where-Object {{ $_ -notmatch "^$k=" }}) -join "`n"
}}
$block = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{b64}'))
$content = ($content.TrimEnd() + "`n" + $block + "`n")
Set-Content -Path $EnvFile -Value $content -Encoding UTF8
Write-Output 'B2 vars written to backend/.env (values not echoed)'

Get-Process node -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2
Start-Process "$Root\\start-backend-watch.cmd" -WindowStyle Hidden
Start-Sleep 45
try {{
  $h = Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20
  Write-Output "health=$($h.Content.Substring(0, [Math]::Min(120, $h.Content.Length)))"
}} catch {{
  Write-Output "health=FAIL $($_.Exception.Message)"
}}
"""

    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=(USER, PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=120,
        read_timeout_sec=150,
    )
    print(f"Applying B2 env block on {HOST}...")
    result = session.run_ps(ps)
    out = (result.std_out or b"").decode("utf-8", errors="replace")
    err = (result.std_err or b"").decode("utf-8", errors="replace")
    print(out)
    if err.strip():
        print(err[-1500:])
    return 0 if result.status_code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
