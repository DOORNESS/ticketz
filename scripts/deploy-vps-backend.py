#!/usr/bin/env python3
"""Deploy compiled backend to Contabo VPS via WinRM (chunked b64 + SHA256)."""

import base64
import hashlib
import os
import random
import sys
import time
import zipfile
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
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip()
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
DIST = BACKEND / "dist"
CHUNK = int(os.environ.get("DEPLOY_B64_CHUNK", "1500"))
DEPLOY_LOCK = r"C:\ticketz\deploy-cache\.deploy.lock"
UPLOAD_STAGING = r"C:\ticketz\dc"
# Lock file younger than this → another deploy is still running.
LOCK_MAX_AGE_SEC = int(
    os.environ.get("DEPLOY_LOCK_MAX_AGE_SEC")
    or os.environ.get("DEPLOY_LOCK_STALE_SEC", "2400")
)
LOCK_WAIT_SEC = int(os.environ.get("DEPLOY_LOCK_WAIT_SEC", "0"))
LOCK_POLL_SEC = int(os.environ.get("DEPLOY_LOCK_POLL_SEC", "30"))

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
    "services/TicketServices/TicketOperationalStateService.js",
    "helpers/assertCanAcceptTicket.js",
    "helpers/ticketHumanHandling.js",
    "helpers/routeReadiness.js",
    "helpers/canViewTicket.js",
    "helpers/isMasterAdmin.js",
    "helpers/mediaConversion.js",
    "middleware/isAdmin.js",
    "middleware/isAuth.js",
    "controllers/SessionController.js",
    "routes/contactRoutes.js",
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
    "controllers/AiToolController.js",
    "routes/versionRoutes.js",
    "routes/heavyRoutes.js",
    "services/TicketServices/UpdateTicketService.js",
    "services/TicketServices/ListTicketsService.js",
    "services/TicketServices/ReopenTicketFromCustomerMessageService.js",
    "services/TicketServices/ReopenClosedTicketManuallyService.js",
    "helpers/CheckContactOpenTickets.js",
    "services/WbotServices/wbotMessageListener.js",
    "services/WbotServices/SendWhatsAppMessage.js",
    "services/WbotServices/SendWhatsAppMedia.js",
    "services/MigrationServices/ApplyAiSchemaService.js",
    "services/MigrationServices/MigrationService.js",
    "services/AiServices/AudioTranscriptionService.js",
    "services/AiServices/AudioPipelineLogger.js",
    "services/AiServices/MediaInboundResolver.js",
    "services/AiServices/ProcessInboundMessageService.js",
    "services/AiServices/sanitizeAiOutboundText.js",
    "services/AiServices/AiPromptBuilder.js",
    "services/AiServices/AiTicketActionsService.js",
    "services/AiServices/AiTicketStateService.js",
    "services/AiServices/RepairAiTicketStatesService.js",
    "services/AiServices/EnsureAiFirstResponderService.js",
    "services/AiServices/AiSetupService.js",
    "services/AiServices/AiCopilotService.js",
    "services/AiServices/AiScheduleContextService.js",
    "services/AiServices/KnowledgeContextService.js",
    "services/AiServices/AiManualTranscriptionService.js",
    "services/AiServices/AiDecisionLogger.js",
    "services/AiServices/HandoffToHumanService.js",
    "services/AiServices/AiHelpers.js",
    "controllers/TicketAiController.js",
    "controllers/TicketController.js",
    "controllers/MessageController.js",
    "routes/ticketRoutes.js",
    "services/AiServices/AiTicketActionsService.js",
    "models/AiTicketTimelineEvent.js",
    "services/StorageService/StorageService.js",
    "services/StorageService/StorageConfigService.js",
    "services/StorageService/ensureCloudStorageReady.js",
    "services/StorageService/storageEnv.js",
    "services/StorageService/storageRetry.js",
    "services/StorageService/objectKeyBuilder.js",
    "services/StorageService/types.js",
    "services/StorageService/BackblazeB2Adapter.js",
    "services/StorageService/S3CompatibleStorageAdapter.js",
    "services/MediaServices/MediaAccessService.js",
    "services/MediaServices/MediaAuthorizationService.js",
    "services/MediaServices/MediaCleanupQueueService.js",
    "services/MediaServices/MediaDeleteObjectService.js",
    "services/MediaServices/MediaOrphanCleanupService.js",
    "services/MediaServices/PermanentDeleteTicketService.js",
    "controllers/MediaAccessController.js",
    "controllers/AiResetController.js",
    "routes/mediaRoutes.js",
    "routes/index.js",
    "helpers/saveMediaFile.js",
    "models/MediaDeletionAudit.js",
    "queues.js",
    "services/MessageServices/ListMessagesService.js",
    "services/AiServices/media/UnifiedMediaPersistenceService.js",
    "services/AiServices/ResetTestEnvironmentService.js",
    "database/migrations/20260723130000-media-lifecycle-b2-private.js",
    "services/AuthServices/SeedStorageSettingsFromEnv.js",
    "libs/wbot.js",
    "libs/socket.js",
    "helpers/bufferToReadStreamTmp.js",
    "services/WbotServices/StartWhatsAppSession.js",
    "services/WbotServices/StartAllWhatsAppsSessions.js",
    "services/WbotServices/WhatsAppSessionWatchdogService.js",
    "models/ContentRepositoryItem.js",
    "models/ContentRepositoryItemVersion.js",
    "models/ContentRepositoryFavorite.js",
    "models/ContentRepositoryCategory.js",
    "models/ContentRepositoryUsageLog.js",
    "models/ContentRepositoryPermission.js",
    "controllers/ContentRepositoryController.js",
    "routes/aiRoutes.js",
    "services/ContentRepository/ContentRepositoryService.js",
    "services/ContentRepository/ContentRepositoryPermissionService.js",
    "services/ContentRepository/SendContentRepositoryItemService.js",
    "services/AiServices/tools/definitions/SearchRepositoryTool.js",
    "services/AiServices/tools/registerPilotTools.js",
    "database/migrations/20260719180000-content-repository.js",
    "database/migrations/20260719200000-content-repository-v2.js",
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


def cleanup_upload_staging(s) -> None:
    run_ps(
        s,
        f"""
Get-ChildItem '{UPLOAD_STAGING}' -Directory -EA SilentlyContinue |
  Remove-Item -Recurse -Force -EA SilentlyContinue
""",
    )


def acquire_deploy_lock(s) -> None:
    force = os.environ.get("DEPLOY_FORCE_LOCK", "").lower() in ("1", "true", "yes")
    force_ps = "$true" if force else "$false"
    deadline = time.time() + max(0, LOCK_WAIT_SEC)

    while True:
        code, out, err = run_ps(
            s,
            f"""
$lock = '{DEPLOY_LOCK}'
$staging = '{UPLOAD_STAGING}'
$maxAgeSec = {LOCK_MAX_AGE_SEC}
$force = {force_ps}
New-Item -ItemType Directory -Force -Path (Split-Path $lock) | Out-Null
if (Test-Path $lock) {{
  if ($force) {{
    Remove-Item $lock -Force
    Get-ChildItem $staging -Directory -EA SilentlyContinue |
      Remove-Item -Recurse -Force -EA SilentlyContinue
  }} else {{
    $age = ((Get-Date) - (Get-Item $lock).LastWriteTime).TotalSeconds
    if ($age -lt $maxAgeSec) {{
      throw "LOCK_HELD:$(Get-Content $lock -Raw)"
    }}
    Remove-Item $lock -Force
    Get-ChildItem $staging -Directory -EA SilentlyContinue |
      Remove-Item -Recurse -Force -EA SilentlyContinue
  }}
}}
Set-Content -Path $lock -Value "pid={os.getpid()} ts={int(time.time())}" -NoNewline
Write-Output "LOCK_ACQUIRED"
""",
        )
        if code == 0:
            return
        held = "LOCK_HELD:" in out
        if held and time.time() < deadline:
            remaining = int(deadline - time.time())
            print(
                f"Deploy lock held ({out.strip()}), retry in {LOCK_POLL_SEC}s "
                f"(up to {remaining}s left)...",
                flush=True,
            )
            time.sleep(LOCK_POLL_SEC)
            continue
        detail = out.strip() or err.strip()
        if held:
            detail = detail.replace("LOCK_HELD:", "deploy in progress: ", 1)
        raise RuntimeError(f"Could not acquire deploy lock: {detail}")


def release_deploy_lock(s) -> None:
    run_ps(
        s,
        f"""
Remove-Item '{DEPLOY_LOCK}' -Force -ErrorAction SilentlyContinue
Get-ChildItem '{UPLOAD_STAGING}' -Directory -EA SilentlyContinue |
  Remove-Item -Recurse -Force -EA SilentlyContinue
""",
    )


def format_upload_label(local_path: Path) -> str:
    try:
        return str(local_path.relative_to(ROOT))
    except ValueError:
        return local_path.name


def upload_file(s, local_path: Path, remote_path: str) -> None:
    data = local_path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    b64 = base64.b64encode(data).decode("ascii")
    upload_id = f"{int(time.time())}-{random.randint(1000, 9999)}"
    b64_dir = rf"C:\ticketz\dc\{upload_id}"
    tmp_path = f"{remote_path}.new"
    expected_b64_len = len(b64)

    run_ps(
        s,
        f"""
Remove-Item '{b64_dir}' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item '{tmp_path}' -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path '{b64_dir}' | Out-Null
if (-not (Test-Path '{b64_dir}')) {{ throw "failed to create upload dir" }}
""",
    )

    total_chunks = (len(b64) + CHUNK - 1) // CHUNK
    for idx in range(1, total_chunks + 1):
        i = (idx - 1) * CHUNK
        chunk = b64[i : i + CHUNK]
        part_path = rf"{b64_dir}\{idx:04d}.txt"
        chunk_b64 = base64.b64encode(chunk.encode("ascii")).decode("ascii")
        code, _, err = run_ps(
            s,
            f"""
New-Item -ItemType Directory -Force -Path '{b64_dir}' | Out-Null
$p = [Text.Encoding]::ASCII.GetString([Convert]::FromBase64String('{chunk_b64}'))
[IO.File]::WriteAllText('{part_path}', $p, [Text.UTF8Encoding]::new($false))
if ((Get-Item '{part_path}').Length -ne {len(chunk)}) {{ throw "part {idx} size mismatch" }}
""",
        )
        if code != 0:
            raise RuntimeError(
                f"Chunk {idx}/{total_chunks} upload failed for {local_path}: {err}"
            )
        if idx == 1 or idx == total_chunks or idx % 20 == 0:
            print(f"    upload {idx}/{total_chunks} chunks", flush=True)

    code, out, err = run_ps(
        s,
        f"""
$parts = Get-ChildItem '{b64_dir}\\*.txt' | Sort-Object Name
if ($parts.Count -ne {total_chunks}) {{
  throw "part count mismatch expected={total_chunks} got=$($parts.Count)"
}}
$b64raw = -join ($parts | ForEach-Object {{
  [IO.File]::ReadAllText($_.FullName, [Text.UTF8Encoding]::new($false))
}})
if ($b64raw.Length -ne {expected_b64_len}) {{
  throw "b64 length mismatch expected={expected_b64_len} got=$($b64raw.Length)"
}}
$bytes = [Convert]::FromBase64String($b64raw)
[IO.File]::WriteAllBytes('{tmp_path}', $bytes)
Remove-Item '{b64_dir}' -Recurse -Force
$sha = (Get-FileHash '{tmp_path}' -Algorithm SHA256).Hash.ToLower()
Write-Output "size=$($bytes.Length) sha=$sha"
Copy-Item '{tmp_path}' '{remote_path}' -Force
Remove-Item '{tmp_path}' -Force
""",
    )

    if code != 0:
        raise RuntimeError(f"Remote decode failed for {local_path}: {out} {err}")
    if digest not in out.lower():
        raise RuntimeError(f"SHA256 mismatch for {local_path}: {out} {err}")
    print(f"  ok {format_upload_label(local_path)} ({len(data)} bytes)")


def build_zip_bundle(files: List[Path], extra_scripts: List[Path]) -> Path:
    """Cria ZIP com dist/ + scripts/ (+ package manifests) para um único upload WinRM."""
    cache_dir = ROOT / "deploy-cache"
    cache_dir.mkdir(exist_ok=True)
    zip_path = cache_dir / f"ticketz-dist-{int(time.time())}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for local in files:
            arc = f"dist/{local.relative_to(DIST).as_posix()}"
            zf.write(local, arc)
        for script in extra_scripts:
            arc = f"scripts/{script.name}"
            zf.write(script, arc)
        # Mantém VPS alinhada com deps novas (ex.: @aws-sdk/s3-request-presigner)
        for manifest_name in ("package.json", "package-lock.json"):
            manifest = BACKEND / manifest_name
            if manifest.is_file():
                zf.write(manifest, manifest_name)
    return zip_path


def upload_zip_bundle(s, zip_path: Path) -> None:
    """Envia 1 ZIP e extrai em C:\\ticketz\\backend (muito mais rápido que N arquivos)."""
    remote_zip = r"C:\ticketz\deploy-cache\ticketz-dist.zip"
    remote_root = r"C:\ticketz\backend"
    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"Uploading zip bundle ({size_mb:.1f} MB)...")
    run_ps(
        s,
        r"New-Item -ItemType Directory -Force -Path C:\ticketz\deploy-cache | Out-Null",
    )
    upload_file(s, zip_path, remote_zip)
    code, out, err = run_ps(
        s,
        f"""
$zip = '{remote_zip}'
$root = '{remote_root}'
Expand-Archive -Path $zip -DestinationPath $root -Force
Remove-Item $zip -Force -EA SilentlyContinue
$count = (Get-ChildItem "$root\\dist" -Recurse -File -EA SilentlyContinue | Measure-Object).Count
Write-Output "extracted dist files=$count"
""",
    )
    print(out.strip())
    if code != 0:
        raise RuntimeError(f"Zip extract failed: {out} {err}")
    zip_path.unlink(missing_ok=True)


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

    for path in sorted(DIST.glob("services/AiServices/*.js")):
        add(path)

    for pattern in (
        "services/AiServices/Triage/**/*.js",
        "services/AiServices/media/**/*.js",
        "services/StorageService/**/*.js",
        "services/MediaServices/**/*.js",
        "database/migrations/20260719100000-ai-triage-v2-professional-flow.js",
        "database/migrations/20260723130000-media-lifecycle-b2-private.js",
    ):
        for path in sorted(DIST.glob(pattern)):
            add(path)

    if mode in ("sync-routes", "routes"):
        for pattern in (
            "routes/*.js",
            "models/*.js",
            "controllers/*.js",
            "services/**/*.js",
            "helpers/*.js",
            "libs/*.js",
            "database/migrations/*.js",
        ):
            for path in sorted(DIST.glob(pattern)):
                add(path)

    return files


def main() -> int:
    if os.environ.get("DEPLOY_USE_ZIP", "").lower() in ("0", "false", "no"):
        print(
            "::error::DEPLOY_USE_ZIP=false não é suportado. "
            "Deploy Contabo deve ser sempre 1 ZIP + Expand-Archive."
        )
        return 1

    if not DIST.is_dir():
        print(f"Missing {DIST} — run npm run build in backend first")
        return 1

    if not PASSWORD:
        print("::error::CONTABO_PASSWORD is required for VPS deploy")
        return 1

    s = session()
    acquire_deploy_lock(s)
    try:
        files = collect_files()
        mode = os.environ.get("DEPLOY_MODE", "patch").lower()
        extra_scripts = []
        reset_script = BACKEND / "scripts" / "reset-whatsapp-session.js"
        schema_script = BACKEND / "scripts" / "apply-db-schema.js"
        triage_script = BACKEND / "scripts" / "apply-triage-v2-schema.js"
        validate_script = BACKEND / "scripts" / "validate-triage-v2-schema.js"
        enable_script = BACKEND / "scripts" / "enable-triage-v2-company.js"
        ensure_wa_script = BACKEND / "scripts" / "ensure-whatsapp-sessions.js"
        wire_lines_script = BACKEND / "scripts" / "wire-support-lines.js"
        report_wa_script = BACKEND / "scripts" / "report-whatsapp-status.js"
        verify_script = BACKEND / "scripts" / "verify-runtime-ready.js"
        restart_script = BACKEND / "scripts" / "restart-after-deploy.ps1"
        for script in (
            reset_script,
            schema_script,
            triage_script,
            validate_script,
            enable_script,
            ensure_wa_script,
            wire_lines_script,
            report_wa_script,
            verify_script,
            restart_script,
        ):
            if script.is_file():
                extra_scripts.append(script)

        print(f"Zip deploy: {len(files)} dist file(s) + {len(extra_scripts)} script(s)")
        zip_path = build_zip_bundle(files, extra_scripts)
        try:
            upload_zip_bundle(s, zip_path)
        finally:
            zip_path.unlink(missing_ok=True)

        skip_reset = os.environ.get("SKIP_WHATSAPP_RESET", "").lower() in (
            "1",
            "true",
            "yes",
        )
        # WinRM has a hard command-line length limit on Windows.
        # Keep the remote call tiny; logic lives in restart-after-deploy.ps1.
        switch = "-SkipWhatsAppReset" if skip_reset else ""
        print("Restart backend..." + (" (no WhatsApp reset)" if skip_reset else ""))
        restart_ps = (
            f"& 'C:\\ticketz\\backend\\scripts\\restart-after-deploy.ps1' {switch}; "
            f"exit $LASTEXITCODE"
        )
        code, out, err = run_ps(s, restart_ps)
        print(out)
        if err.strip():
            print(err[-2000:])
        if code != 0:
            print("::error::Backend local health check failed after restart")
            return 1
        return 0
    finally:
        release_deploy_lock(s)


if __name__ == "__main__":
    sys.exit(main())
