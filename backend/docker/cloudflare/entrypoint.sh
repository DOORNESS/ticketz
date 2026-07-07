#!/bin/bash
set -euo pipefail

mkdir -p /data/redis /usr/src/app/public /usr/src/app/private

echo "[entrypoint] Starting Redis..."
redis-server \
  --daemonize yes \
  --dir /data/redis \
  --appendonly yes \
  --save "" \
  --maxmemory 64mb \
  --maxmemory-policy allkeys-lru \
  --tcp-backlog 128 \
  --protected-mode no \
  --bind 127.0.0.1

for _ in $(seq 1 25); do
  if redis-cli ping >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export REDIS_URI="${REDIS_URI:-redis://127.0.0.1:6379}"
export LISTEN_FIRST="${LISTEN_FIRST:-true}"

if [ ! -f /usr/src/app/dist/server.js ]; then
  echo "[entrypoint] ERROR: dist/server.js not found" >&2
  ls -la /usr/src/app/dist >&2 || true
  exit 1
fi

echo "[entrypoint] Starting Ticketz API on port ${PORT}..."
exec node dist/server.js
