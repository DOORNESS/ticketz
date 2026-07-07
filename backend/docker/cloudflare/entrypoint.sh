#!/bin/bash
set -euo pipefail

mkdir -p /data/redis /usr/src/app/public /usr/src/app/private

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

exec node dist/server.js
