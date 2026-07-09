#!/usr/bin/env python3
"""Deploy compiled backend to Contabo VPS via WinRM (chunked b64 + SHA256)."""

import base64
import hashlib
import os
import sys
from pathlib import Path
from typing import List

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = os.environ.get("CONTABO_PASSWORD", "")
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
DIST = BACKEND / "dist"
CHUNK = 2000

# Hotfix paths — full dist sync is too slow over WinRM (600+ files).
PATCH_PATHS = [
    "libs/wbot.js",
    "services/StorageService/StorageService.js",
    "services/WbotServices/StartWhatsAppSession.js",
    "services/WbotServices/wbotMessageListener.js",
    "services/AiServices/ProcessInboundMessageService.js",
    "services/AiServices/AiScheduleContextService.js",
    "services/AiServices/KnowledgeContextService.js",
]


def session():
    return winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=(USER, PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=600,
        read_timeout_sec=720,
    )


def run_ps(s, ps):
    r = s.run_ps(ps)
    out = (r.std_out or b"").decode("utf-8", errors="replace")
    err = (r.std_err or b"").decode("utf-8", errors="replace")
    return r.status_code, out, err


def upload_file(s, local_path: Path, remote_path: str) -> None:
    data = local_path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    b64 = base64.b64encode(data).decode("ascii")
    b64_path = f"{remote_path}.b64"
    tmp_path = f"{remote_path}.new"

    run_ps(
        s,
        f"""
Remove-Item '{b64_path}' -Force -ErrorAction SilentlyContinue
Remove-Item '{tmp_path}' -Force -ErrorAction SilentlyContinue
""",
    )

    for i in range(0, len(b64), CHUNK):
        chunk = b64[i : i + CHUNK].replace("'", "''")
        run_ps(
            s,
            f"Add-Content -Path '{b64_path}' -Value '{chunk}' -NoNewline -Encoding ASCII",
        )

    code, out, err = run_ps(
        s,
        f"""
$b64raw = Get-Content '{b64_path}' -Raw
$bytes = [Convert]::FromBase64String($b64raw)
[IO.File]::WriteAllBytes('{tmp_path}', $bytes)
Remove-Item '{b64_path}' -Force
$sha = (Get-FileHash '{tmp_path}' -Algorithm SHA256).Hash.ToLower()
Write-Output "size=$($bytes.Length) sha=$sha"
Copy-Item '{tmp_path}' '{remote_path}' -Force
Remove-Item '{tmp_path}' -Force
""",
    )

    if digest not in out.lower():
        raise RuntimeError(f"SHA256 mismatch for {local_path}: {out} {err}")
    print(f"  ok {local_path.relative_to(ROOT)} ({len(data)} bytes)")


def collect_files() -> List[Path]:
    mode = os.environ.get("DEPLOY_MODE", "patch").lower()
    if mode == "full":
        return sorted(DIST.rglob("*.js"))

    files = []
    for rel in PATCH_PATHS:
        path = DIST / rel.replace("/", os.sep)
        if not path.is_file():
            raise FileNotFoundError(f"Missing build output: {path}")
        files.append(path)
    return files


def main() -> int:
    if not PASSWORD:
        print("CONTABO_PASSWORD required")
        return 1
    if not DIST.is_dir():
        print(f"Missing {DIST} — run npm run build in backend first")
        return 1

    s = session()
    print("Stopping backend...")
    run_ps(s, "Get-Process node -EA SilentlyContinue | Stop-Process -Force")

    files = collect_files()
    print(f"Uploading {len(files)} file(s)...")
    for local in files:
        rel = local.relative_to(DIST).as_posix().replace("/", "\\")
        remote = f"C:\\ticketz\\backend\\dist\\{rel}"
        run_ps(
            s,
            f"New-Item -ItemType Directory -Force -Path (Split-Path '{remote}') | Out-Null",
        )
        upload_file(s, local, remote)

    reset_script = BACKEND / "scripts" / "reset-whatsapp-session.js"
    if reset_script.is_file():
        upload_file(s, reset_script, r"C:\ticketz\backend\scripts\reset-whatsapp-session.js")

    skip_reset = os.environ.get("SKIP_WHATSAPP_RESET", "").lower() in (
        "1",
        "true",
        "yes",
    )
    reset_step = ""
    if not skip_reset:
        reset_step = (
            "Push-Location C:\\ticketz\\backend\n"
            "node scripts/reset-whatsapp-session.js 1 2>&1\n"
            "Pop-Location\n"
        )

    print("Restart backend..." + (" (no WhatsApp reset)" if skip_reset else ""))
    restart_ps = (
        "$ErrorActionPreference='Continue'\n"
        + reset_step
        + """
Start-ScheduledTask -TaskName TicketzRedis -EA SilentlyContinue
Start-Sleep 2
Start-ScheduledTask -TaskName TicketzBackend
Start-Sleep 60
try { Write-Output "health=$((Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20).Content)" } catch { Write-Output 'health fail' }
try { $r=Invoke-WebRequest http://127.0.0.1:8080/whatsapp -UseBasicParsing -TimeoutSec 15; Write-Output "whatsapp=$($r.StatusCode)" } catch { Write-Output "whatsapp=$($_.Exception.Response.StatusCode.value__)" }
Get-Content C:\\ticketz\\logs\\backend.log -Tail 12 -EA SilentlyContinue | Select-String 'Heavy|QRCode|listening|failed|transcri'
"""
    )
    code, out, err = run_ps(s, restart_ps)
    print(out)
    if err.strip():
        print(err[-2000:])
    return 0 if code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
