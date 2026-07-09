#!/usr/bin/env python3
"""Deploy compiled backend to Contabo VPS via WinRM (chunked b64 + SHA256)."""

import base64
import hashlib
import os
import sys
from pathlib import Path
from typing import List, Optional

import winrm

DEFAULT_HOST = "31.220.103.226"


def normalize_host(value: Optional[str]) -> str:
    raw = (value or "").strip()
    if not raw:
        return DEFAULT_HOST
    raw = raw.replace("https://", "").replace("http://", "").strip("/")
    raw = raw.split("/")[0].split(":")[0].strip()
    return raw or DEFAULT_HOST


HOST = normalize_host(os.environ.get("CONTABO_HOST"))
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
DIST = BACKEND / "dist"
CHUNK = 2000

# Hotfix paths — full dist sync is too slow over WinRM (600+ files).
PATCH_PATHS = [
    "server.js",
    "app.js",
    "appFast.js",
    "gitinfo.js",
    "database/index.js",
    "helpers/servePublicMedia.js",
    "helpers/mediaStorage.js",
    "helpers/buildInfo.js",
    "helpers/routeReadiness.js",
    "helpers/mediaConversion.js",
    "models/Message.js",
    "models/Ticket.js",
    "models/AiAgent.js",
    "models/AiAgentQueue.js",
    "models/AiConversationLog.js",
    "models/AiCopilotSuggestion.js",
    "models/AiKnowledgeSuggestion.js",
    "models/AiReplayLog.js",
    "models/MessageMediaFile.js",
    "models/KnowledgeBase.js",
    "models/KnowledgeDocument.js",
    "models/KnowledgeChunk.js",
    "controllers/VersionController.js",
    "controllers/AiAgentController.js",
    "routes/versionRoutes.js",
    "routes/heavyRoutes.js",
    "services/TicketServices/UpdateTicketService.js",
    "services/TicketServices/ListTicketsService.js",
    "services/WbotServices/wbotMessageListener.js",
    "services/WbotServices/SendWhatsAppMedia.js",
    "services/MigrationServices/ApplyAiSchemaService.js",
    "services/MigrationServices/MigrationService.js",
    "services/AiServices/AudioTranscriptionService.js",
    "services/AiServices/AudioPipelineLogger.js",
    "services/AiServices/MediaInboundResolver.js",
    "services/AiServices/ProcessInboundMessageService.js",
    "services/AiServices/AiTicketActionsService.js",
    "services/AiServices/AiTicketStateService.js",
    "services/AiServices/RepairAiTicketStatesService.js",
    "services/AiServices/EnsureAiFirstResponderService.js",
    "services/AiServices/AiSetupService.js",
    "services/AiServices/AiCopilotService.js",
    "services/AiServices/AiScheduleContextService.js",
    "services/AiServices/KnowledgeContextService.js",
    "services/StorageService/StorageService.js",
    "libs/wbot.js",
    "helpers/bufferToReadStreamTmp.js",
    "services/WbotServices/StartWhatsAppSession.js",
]


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

    files: List[Path] = []
    seen = set()

    def add(path: Path) -> None:
        key = path.as_posix()
        if key not in seen and path.is_file():
            files.append(path)
            seen.add(key)

    for rel in PATCH_PATHS:
        path = DIST / rel.replace("/", os.sep)
        if not path.is_file():
            raise FileNotFoundError(f"Missing build output: {path}")
        add(path)

    if mode in ("sync-routes", "routes"):
        for pattern in (
            "routes/*.js",
            "models/*.js",
            "controllers/*.js",
            "services/**/*.js",
            "helpers/*.js",
            "libs/*.js",
        ):
            for path in sorted(DIST.glob(pattern)):
                add(path)

    return files


def main() -> int:
    if not DIST.is_dir():
        print(f"Missing {DIST} — run npm run build in backend first")
        return 1

    s = session()
    files = collect_files()
    print(
        f"Uploading {len(files)} file(s) while API stays online "
        f"(mode={os.environ.get('DEPLOY_MODE', 'patch')})..."
    )
    for idx, local in enumerate(files, start=1):
        rel = local.relative_to(DIST).as_posix().replace("/", "\\")
        remote = f"C:\\ticketz\\backend\\dist\\{rel}"
        run_ps(
            s,
            f"New-Item -ItemType Directory -Force -Path (Split-Path '{remote}') | Out-Null",
        )
        upload_file(s, local, remote)
        if idx % 50 == 0:
            print(f"  ... {idx}/{len(files)} files uploaded")

    reset_script = BACKEND / "scripts" / "reset-whatsapp-session.js"
    schema_script = BACKEND / "scripts" / "apply-db-schema.js"
    if reset_script.is_file():
        upload_file(s, reset_script, r"C:\ticketz\backend\scripts\reset-whatsapp-session.js")
    if schema_script.is_file():
        upload_file(s, schema_script, r"C:\ticketz\backend\scripts\apply-db-schema.js")

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
$Root='C:\\ticketz'
schtasks /Change /TN TicketzBackend /DISABLE 2>&1 | Out-Null
schtasks /Change /TN TicketzRedis /DISABLE 2>&1 | Out-Null
Get-Process node -EA SilentlyContinue | Stop-Process -Force
Get-Process redis-server -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2
$redis = @("$Root\\start-redis.cmd","$Root\\run-redis.cmd") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($redis) { Start-Process $redis -WindowStyle Hidden }
Start-Sleep 3
if (Test-Path "$Root\\backend\\scripts\\apply-db-schema.js") {
  Push-Location "$Root\\backend"
  node scripts\\apply-db-schema.js 2>&1
  Pop-Location
}
$backend = @("$Root\\start-backend-watch.cmd","$Root\\start-backend.cmd","$Root\\run-backend.cmd") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($backend) { Start-Process $backend -WindowStyle Hidden } else {
  Start-Process node -ArgumentList 'dist\\server.js' -WorkingDirectory 'C:\\ticketz\\backend' -WindowStyle Hidden
}
Start-Sleep 60
$healthOk = $false
try {
  $h = Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 20
  Write-Output "health=$($h.Content)"
  if ($h.StatusCode -eq 200) { $healthOk = $true }
} catch { Write-Output "health fail $($_.Exception.Message)" }
try {
  $r = Invoke-WebRequest 'http://127.0.0.1/health' -Headers @{Host='api.fortmax.com.br'} -UseBasicParsing -TimeoutSec 15
  Write-Output "iis_proxy=$($r.StatusCode) $($r.Content.Substring(0,[Math]::Min(120,$r.Content.Length)))"
} catch { Write-Output "iis_proxy=FAIL $($_.Exception.Message)" }
try { $r=Invoke-WebRequest http://127.0.0.1:8080/queue -UseBasicParsing -TimeoutSec 15; Write-Output "queue=$($r.StatusCode)" } catch { Write-Output "queue=$($_.Exception.Response.StatusCode.value__)" }
Get-Content C:\\ticketz\\logs\\backend.err.log -Tail 20 -EA SilentlyContinue
Get-Content C:\\ticketz\\logs\\backend.log -Tail 12 -EA SilentlyContinue | Select-String 'listening|failed|error|Heavy'
if (-not $healthOk) { exit 1 }
"""
    )
    code, out, err = run_ps(s, restart_ps)
    print(out)
    if err.strip():
        print(err[-2000:])
    if code != 0:
        print("::error::Backend local health check failed after restart")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
