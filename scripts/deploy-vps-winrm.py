#!/usr/bin/env python3
"""Deploy Ticketz backend to Contabo Windows VPS via WinRM."""

import base64
import os
import sys
import time

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
USER = os.environ.get("CONTABO_USER", "administrator")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip()
if not PASSWORD:
    raise SystemExit(
        "CONTABO_PASSWORD nao definido. A senha da VPS ficava hardcoded aqui "
        "como fallback, num repositorio publico. Defina a variavel de ambiente."
    )
TARBALL = os.environ.get("DEPLOY_TARBALL", "/tmp/ticketz-vps-deploy.tar.gz")
REMOTE_ROOT = r"C:\ticketz"
CHUNK = 6000


def session():
    return winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=(USER, PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
    )


def run_ps(s, script, timeout=600):
    r = s.run_ps(script)
    out = (r.std_out or b"").decode("utf-8", errors="replace")
    err = (r.std_err or b"").decode("utf-8", errors="replace")
    return r.status_code, out, err


def wait_for_server(max_wait=600):
    deadline = time.time() + max_wait
    while time.time() < deadline:
        try:
            s = session()
            code, out, _ = run_ps(s, "Write-Output 'ping'")
            if code == 0 and "ping" in out:
                return True
        except Exception:
            pass
        time.sleep(15)
    return False


def upload_tarball(s):
    with open(TARBALL, "rb") as f:
        data = f.read()
    b64 = base64.b64encode(data).decode("ascii")
    print(f"Uploading {len(data)} bytes ({len(b64)} b64)...")

    run_ps(
        s,
        f"""
New-Item -ItemType Directory -Force -Path '{REMOTE_ROOT}' | Out-Null
Remove-Item '{REMOTE_ROOT}\\ticketz-vps-deploy.tar.gz' -Force -ErrorAction SilentlyContinue
Remove-Item '{REMOTE_ROOT}\\ticketz-vps-deploy.tar.gz.b64' -Force -ErrorAction SilentlyContinue
""",
    )

    for i in range(0, len(b64), CHUNK):
        chunk = b64[i : i + CHUNK]
        chunk_esc = chunk.replace("'", "''")
        run_ps(
            s,
            f"Add-Content -Path '{REMOTE_ROOT}\\ticketz-vps-deploy.tar.gz.b64' -Value '{chunk_esc}' -NoNewline",
        )
        if i % (CHUNK * 20) == 0:
            print(f"  uploaded {i}/{len(b64)}")

    code, out, err = run_ps(
        s,
        f"""
$bytes = [Convert]::FromBase64String((Get-Content '{REMOTE_ROOT}\\ticketz-vps-deploy.tar.gz.b64' -Raw))
[IO.File]::WriteAllBytes('{REMOTE_ROOT}\\ticketz-vps-deploy.tar.gz', $bytes)
Remove-Item '{REMOTE_ROOT}\\ticketz-vps-deploy.tar.gz.b64' -Force
Write-Output "Wrote $($bytes.Length) bytes"
""",
    )
    print(out.strip())
    if code != 0:
        raise RuntimeError(f"upload failed: {err}")


def write_env_file(s, env_content):
    lines = env_content.strip().split("\n")
    run_ps(s, f"Remove-Item '{REMOTE_ROOT}\\.env-backend-vps' -Force -ErrorAction SilentlyContinue")
    for line in lines:
        if not line.strip() or line.strip().startswith("#"):
            continue
        esc = line.replace("'", "''")
        run_ps(s, f"Add-Content -Path '{REMOTE_ROOT}\\.env-backend-vps' -Value '{esc}'")


def enable_wsl(s):
    ps = r"""
$ErrorActionPreference = 'Stop'
$log = 'C:\ticketz\deploy.log'
function L($m){ Add-Content $log "[$(Get-Date -Format o)] $m"; Write-Output $m }

New-Item -ItemType Directory -Force -Path 'C:\ticketz' | Out-Null
L 'Checking WSL features...'
$wsl = (Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux).State
$vmp = (Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform).State
L "WSL=$wsl VMP=$vmp"

$changed = $false
if ($wsl -ne 'Enabled') {
  L 'Enabling WSL...'
  Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart | Out-Null
  $changed = $true
}
if ($vmp -ne 'Enabled') {
  L 'Enabling VirtualMachinePlatform...'
  Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart | Out-Null
  $changed = $true
}

if ($changed) {
  L 'REBOOT_REQUIRED'
  exit 10
}

$distros = wsl -l -v 2>&1 | Out-String
L "WSL distros: $distros"
if ($distros -notmatch 'Ubuntu-22.04') {
  L 'Installing Ubuntu-22.04...'
  wsl --install -d Ubuntu-22.04 --no-launch 2>&1 | ForEach-Object { L $_ }
  L 'REBOOT_REQUIRED_AFTER_UBUNTU'
  exit 10
}

L 'WSL_READY'
exit 0
"""
    return run_ps(s, ps)


def setup_firewall(s):
    ps = r"""
$rule = 'Ticketz-Backend-8080'
if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $rule -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 | Out-Null
  Write-Output 'Firewall rule created'
} else { Write-Output 'Firewall rule exists' }
"""
    return run_ps(s, ps)


def deploy_in_wsl(s):
    ps = rf"""
$ErrorActionPreference = 'Continue'
$winPath = '{REMOTE_ROOT}'
$wslPath = wsl wslpath -a $winPath 2>$null
if (-not $wslPath) {{ $wslPath = '/mnt/c/ticketz' }}
Write-Output "WSL path: $wslPath"

$bash = @'
set -e
export DEBIAN_FRONTEND=noninteractive
TROOT=$(wslpath -a 'C:\ticketz' 2>/dev/null || echo /mnt/c/ticketz)
cd "$TROOT"
mkdir -p "$TROOT"
if [ -f ticketz-vps-deploy.tar.gz ]; then
  tar xzf ticketz-vps-deploy.tar.gz
fi
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
sudo service docker start 2>/dev/null || true
sleep 2
if ! docker info >/dev/null 2>&1; then
  sudo dockerd >/tmp/dockerd.log 2>&1 &
  sleep 5
fi
docker --version
docker compose version
docker compose -f docker-compose-vps.yaml build --progress=plain 2>&1 | tail -30
docker compose -f docker-compose-vps.yaml up -d
sleep 10
docker compose -f docker-compose-vps.yaml ps
curl -fsS http://127.0.0.1:8080/health || curl -fsS http://localhost:8080/health || true
'@

wsl -d Ubuntu-22.04 -e bash -lc $bash 2>&1
"""
    return run_ps(s, ps, timeout=3600)


def main():
    print(f"Connecting to {HOST}...")
    s = session()

    print("=== Step 1: Enable WSL ===")
    code, out, err = enable_wsl(s)
    print(out)
    if code == 10:
        print("Reboot required. Rebooting server...")
        run_ps(s, "shutdown /r /t 30 /c 'Ticketz WSL setup'")
        print("Waiting for server to come back (up to 10 min)...")
        if not wait_for_server(600):
            print("Server did not return in time")
            sys.exit(1)
        s = session()
        code, out, err = enable_wsl(s)
        print(out)
        if code == 10:
            print("Second reboot may be needed for Ubuntu install...")
            run_ps(s, "shutdown /r /t 20 /c 'Ticketz Ubuntu WSL'")
            if not wait_for_server(600):
                sys.exit(1)
            s = session()
            code, out, err = enable_wsl(s)
            print(out)

    print("=== Step 2: Upload tarball ===")
    upload_tarball(s)

    env_path = os.environ.get(
        "ENV_BACKEND_VPS",
        os.path.join(os.path.dirname(TARBALL), ".env-backend-vps"),
    )
    if os.path.isfile(
        "/Users/fernandotarin/Desktop/Fernando/Cursor/Ticketz Suporte/ticketz/.env-backend-vps"
    ):
        with open(
            "/Users/fernandotarin/Desktop/Fernando/Cursor/Ticketz Suporte/ticketz/.env-backend-vps"
        ) as f:
            write_env_file(s, f.read())
    else:
        print("WARNING: .env-backend-vps not found locally — must exist on server")

    print("=== Step 3: Firewall ===")
    code, out, err = setup_firewall(s)
    print(out)

    print("=== Step 4: Docker deploy in WSL ===")
    code, out, err = deploy_in_wsl(s)
    print(out[-8000:] if len(out) > 8000 else out)
    if err:
        print("STDERR:", err[-2000:])
    print("exit:", code)


if __name__ == "__main__":
    main()
