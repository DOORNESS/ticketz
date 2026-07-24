param(
  [switch]$SkipWhatsAppReset
)

$ErrorActionPreference = "Continue"
$Root = "C:\ticketz"
$Backend = Join-Path $Root "backend"

Write-Output "restart-after-deploy start SkipWhatsAppReset=$SkipWhatsAppReset"

if (-not $SkipWhatsAppReset) {
  Push-Location $Backend
  try {
    if (Test-Path "scripts\reset-whatsapp-session.js") {
      node scripts\reset-whatsapp-session.js 1 2>&1
    }
  } finally {
    Pop-Location
  }
}

schtasks /Change /TN TicketzBackend /DISABLE 2>&1 | Out-Null
schtasks /Change /TN TicketzRedis /DISABLE 2>&1 | Out-Null
Get-Process node -EA SilentlyContinue | Stop-Process -Force
Get-Process redis-server -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2

$redis = @("$Root\start-redis.cmd", "$Root\run-redis.cmd") |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if ($redis) {
  Start-Process $redis -WindowStyle Hidden
}
Start-Sleep 3

$ErrorActionPreference = "Stop"
Push-Location $Backend
try {
  Write-Output "apply-db-schema..."
  if (-not (Test-Path "scripts\apply-db-schema.js")) {
    throw "apply-db-schema.js missing"
  }
  node scripts\apply-db-schema.js 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "apply-db-schema failed exit=$LASTEXITCODE"
  }

  if (Test-Path "scripts\apply-triage-v2-schema.js") {
    node scripts\apply-triage-v2-schema.js 2>&1
  }
  if (Test-Path "scripts\ensure-whatsapp-sessions.js") {
    node scripts\ensure-whatsapp-sessions.js 2>&1
  }
  if (Test-Path "scripts\wire-support-lines.js") {
    Write-Output "wire-support-lines..."
    node scripts\wire-support-lines.js 2>&1
  }

  Write-Output "npm install storage deps..."
  npm install @aws-sdk/s3-request-presigner@3.1093.0 @aws-sdk/client-s3@3.1080.0 --omit=dev --no-audit --no-fund 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "npm install storage deps failed exit=$LASTEXITCODE"
  }

  Write-Output "verify-runtime-ready..."
  if (-not (Test-Path "scripts\verify-runtime-ready.js")) {
    throw "verify-runtime-ready.js missing"
  }
  node scripts\verify-runtime-ready.js 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "verify-runtime-ready failed exit=$LASTEXITCODE"
  }
} catch {
  Write-Output "PRESTART_FAIL $($_.Exception.Message)"
  Pop-Location
  exit 1
}
Pop-Location

$ErrorActionPreference = "Continue"
$backendCmd = @(
  "$Root\start-backend-watch.cmd",
  "$Root\start-backend.cmd",
  "$Root\run-backend.cmd"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($backendCmd) {
  Start-Process $backendCmd -WindowStyle Hidden
} else {
  Start-Process node -ArgumentList "dist\server.js" -WorkingDirectory $Backend -WindowStyle Hidden
}

$healthOk = $false
for ($i = 0; $i -lt 18; $i++) {
  Start-Sleep 5
  try {
    $h = Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 10
    Write-Output "health=$($h.Content)"
    if ($h.StatusCode -eq 200) {
      $healthOk = $true
      break
    }
  } catch {
    Write-Output "health wait attempt=$i $($_.Exception.Message)"
  }
}

if (-not $healthOk) {
  Write-Output "health fail after polling"
}

try {
  $r = Invoke-WebRequest "http://127.0.0.1/health" -Headers @{ Host = "api.fortmax.com.br" } -UseBasicParsing -TimeoutSec 15
  Write-Output "iis_proxy=$($r.StatusCode) $($r.Content.Substring(0, [Math]::Min(120, $r.Content.Length)))"
} catch {
  Write-Output "iis_proxy=FAIL $($_.Exception.Message)"
}

try {
  $r = Invoke-WebRequest http://127.0.0.1:8080/queue -UseBasicParsing -TimeoutSec 15
  Write-Output "queue=$($r.StatusCode)"
} catch {
  Write-Output "queue=$($_.Exception.Response.StatusCode.value__)"
}

if (Test-Path "$Backend\scripts\report-whatsapp-status.js") {
  Push-Location $Backend
  node scripts\report-whatsapp-status.js 2>&1
  Pop-Location
}

Get-Content "$Root\logs\backend.err.log" -Tail 20 -EA SilentlyContinue
Get-Content "$Root\logs\backend.log" -Tail 12 -EA SilentlyContinue |
  Select-String "listening|failed|error|Heavy"

if (-not $healthOk) {
  exit 1
}

Write-Output "restart-after-deploy ok"
exit 0
