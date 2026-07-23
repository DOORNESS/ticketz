#!/usr/bin/env bash
# Ticketz — desenvolvimento local (testar antes de push/deploy)
# Uso:
#   ./scripts/dev-local.sh real        # Supabase real + só Redis (Docker leve)
#   ./scripts/dev-local.sh env-real    # gera backend/.env
#   ./scripts/dev-local.sh redis       # só Redis no Docker
#   ./scripts/dev-local.sh setup       # npm ci + build
#   ./scripts/dev-local.sh check       # valida API + CORS
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

write_real_env() {
  if [ ! -f .env-backend-supabase ]; then
    echo "❌ Arquivo .env-backend-supabase não encontrado na raiz do projeto"
    exit 1
  fi
  echo "→ Gerando backend/.env (Supabase real, sem Postgres local)..."
  cat > backend/.env <<'ENVEOF'
# Local dev — dados reais Supabase (gerado por scripts/dev-local.sh)
NODE_ENV=development
HOST=0.0.0.0
PORT=8082
TZ=America/Sao_Paulo

FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8082

DB_DIALECT=postgres
DB_HOST=aws-1-sa-east-1.pooler.supabase.com
DB_PORT=5432
DB_USER=postgres.tcwtpkadwrsbdvehsmfy
DB_PASS=y$QXZram5@w2JKE
DB_NAME=postgres
DB_SCHEMA=ticketz
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
DB_TIMEZONE=-03:00
DB_MAX_CONNECTIONS=3
DB_MIN_CONNECTIONS=0

REDIS_URI=redis://127.0.0.1:6379
REDIS_OPT_LIMITER_MAX=1
REDIS_OPT_LIMITER_DURATION=3000

USER_LIMIT=10000
CONNECTIONS_LIMIT=100000
CLOSED_SEND_BY_ME=true
VERIFY_TOKEN=ticketz
SOCKET_ADMIN=true
AUTO_MIGRATE=false

JWT_SECRET=fortmax-ticketz-access-jwt-v1-7f3a9c2e8b1d4f6a0c5e9b2d7f1a4c8e
JWT_REFRESH_SECRET=fortmax-ticketz-refresh-jwt-v1-2b8d4f6a1c9e3b7d0f5a8c2e6b4d1f9a
JWT_ACCESS_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=30d

TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=0x4AAAAAADhSILt9PsBiVeID
TURNSTILE_SECRET_KEY=0x4AAAAAADhSIMRIuil81syEGDWePGiCHeE

AI_REENGAGEMENT_ENABLED=true
AI_PROACTIVE_FOLLOWUP_ENABLED=true
AI_PROACTIVE_FOLLOWUP_MINUTES=5
AI_ORCHESTRATOR_ENABLED=false
AI_ORCHESTRATOR_MODEL=gpt-4o-mini
AI_ORCHESTRATOR_TEMPERATURE=0
AI_ORCHESTRATOR_MAX_TOKENS=200
AI_ORCHESTRATOR_TIMEOUT_MS=15000
AI_ORCHESTRATOR_CONFIDENCE_THRESHOLD=0.4
AI_ORCHESTRATOR_PROVIDER=openai
ENVEOF
  echo "✅ backend/.env pronto (AUTO_MIGRATE=false — não altera schema)"
}

start_redis() {
  if command -v redis-cli >/dev/null 2>&1 && redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✅ Redis já rodando em :6379"
    return 0
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Redis necessário. Instale Docker Desktop OU: brew install redis && redis-server"
    exit 1
  fi
  echo "→ Subindo só Redis (Docker, sem Postgres)..."
  docker compose -f docker-compose-dev.yaml up -d redis
  sleep 2
  echo "✅ Redis :6379"
}

case "${1:-help}" in
  env-real)
    write_real_env
    ;;
  redis)
    start_redis
    ;;
  setup)
    write_real_env
    start_redis
    echo "→ Backend: npm ci + build..."
    (cd backend && npm ci --no-audit --no-fund && npm run build)
    echo "→ Frontend: npm ci..."
    (cd frontend && npm ci --no-audit --no-fund)
    echo "✅ Dependências instaladas"
    ;;
  real)
    write_real_env
    start_redis
    echo ""
    echo "✅ Pronto! Abra 2 terminais:"
    echo ""
    echo "  Terminal 1 — API:"
    echo "    cd backend && npm run dev:server"
    echo ""
    echo "  Terminal 2 — Painel:"
    echo "    cd frontend && npm start"
    echo ""
    echo "  Depois: ./scripts/dev-local.sh check"
    echo "  URL: http://localhost:3000"
    echo ""
    echo "⚠️  Usa banco Supabase REAL (mesmos tickets/usuários de produção)."
    echo "   AUTO_MIGRATE=false — não roda migration automática."
    ;;
  infra)
    echo "→ Subindo Postgres + Redis (Docker)..."
    docker compose -f docker-compose-dev.yaml up -d
    echo "✅ Postgres :5432 | Redis :6379 | pgAdmin :8081"
    ;;
  backend)
    write_real_env
    start_redis
    cd backend
    npm ci --no-audit --no-fund
    npm run build
    echo "→ Backend em http://localhost:8082"
    echo "   Rode: cd backend && npm run dev:server"
    ;;
  frontend)
    if [ ! -f frontend/public/config-dev.json ]; then
      cp frontend/public/config-dev-example.json frontend/public/config-dev.json
    fi
    cd frontend
    npm ci --no-audit --no-fund
    echo "→ Frontend em http://localhost:3000"
    echo "   Rode: cd frontend && npm start"
    ;;
  check)
    echo "=== Ticketz local ==="
    if curl -fsS --max-time 8 http://localhost:8082/health 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('API OK | heavyRoutes:', d.get('heavyRoutes'), '| commit:', d.get('commitHash','?'))
" 2>/dev/null; then
      :
    else
      echo "❌ Backend OFF — rode: cd backend && npm run dev:server"
    fi
    if curl -fsS --max-time 5 http://localhost:3000/ -o /dev/null 2>/dev/null; then
      echo "✅ Frontend OK"
    else
      echo "❌ Frontend OFF — rode: cd frontend && npm start"
    fi
    echo "=== CORS login ==="
    curl -fsS --max-time 5 -X OPTIONS \
      -H "Origin: http://localhost:3000" \
      -H "Access-Control-Request-Method: POST" \
      http://localhost:8082/auth/login -D - -o /dev/null 2>/dev/null | grep -i access-control || echo "(sem CORS — backend off?)"
    echo "=== Turnstile ==="
    curl -fsS --max-time 5 http://localhost:8082/public-settings/turnstileSiteKey 2>/dev/null | head -c 80 || echo "turnstile setting indisponível"
    echo
    ;;
  help|*)
    cat <<'EOF'
Ticketz — testar local ANTES de push (economiza GitHub Actions)

── Modo recomendado (dados reais Supabase, sem Postgres local) ──

  ./scripts/dev-local.sh setup     # 1x: env + redis + npm ci + build
  cd backend && npm run dev:server # terminal 1
  cd frontend && npm start         # terminal 2
  ./scripts/dev-local.sh check     # validar

  Ou tudo de uma vez:
  ./scripts/dev-local.sh real      # mostra os comandos

── O que sobe localmente ──
  • API Node      → localhost:8082
  • Painel React  → localhost:3000
  • Redis         → Docker (só 1 container leve)
  • Banco         → Supabase remoto (dados reais)

── Modo isolado (banco local vazio) ──
  ./scripts/dev-local.sh infra     # Postgres + Redis Docker

Só faça push na main quando ./scripts/dev-local.sh check passar.
EOF
    ;;
esac
