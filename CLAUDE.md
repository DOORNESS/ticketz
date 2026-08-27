# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ticketz — WhatsApp-based communicator with CRM/helpdesk, multi-tenant by `Company`. This fork (`DOORNESS/ticketz`) adds a large **AI platform** on top of upstream Ticketz: RAG over pgvector, AI triage/orchestration, knowledge CMS, contact memory, executable tools, and an AI observability dashboard.

Two independent packages, **no root `package.json`**:
- `backend/` — Node/Express/TypeScript, Sequelize + Postgres, Redis + Bull, Socket.io
- `frontend/` — React 17 in **JavaScript (not TypeScript)**, Material-UI v4, CRA 5

Also present: `api-worker/` (Cloudflare Worker), `functions/` (Cloudflare Pages middleware), `scripts/` (Python/Node ops + VPS deploy), `docs/` (official manual).

## Mandatory repo rules

These come from `.cursor/rules/` and apply to Claude too.

### 1. Documentation is a hard gate (`documentation-rules.mdc`)

`docs/MANUAL_PLATAFORMA.md` is the **source of truth**. Any change to architecture, DB/migrations/models, services, APIs/endpoints, AI/agents/RAG/prompts, Bull queues, Socket.io, admin frontend, auth/permissions, deploy/env vars/CI, or folder organization **must** update it before the task is considered done:

1. Update the matching section of `MANUAL_PLATAFORMA.md` (create one if new).
2. Update the thematic index (`docs/architecture.md`, `ai.md`, `rag.md`, `database.md`, `api.md`, `deployment.md`, `frontend.md`, `backend.md`, `integrations.md`, `roadmap.md`) — indexes point at the manual, never duplicate long content.
3. Update affected Mermaid diagrams, flows, tables, examples.
4. Update §22 (roadmap), §41 (tech debt), §43 (risks) when relevant.
5. Add an entry to `docs/changelog.md` (date, manual version, sections, summary).
6. Bump the manual version in its header on structural change.

Never document endpoints/services/tables that don't exist in code — validate against the code first. Every technical report must end with the `Documentação:` block specified in the rule file.

Section map: Architecture §2/§25 · AI §11/§27/§38 · RAG §28/§29 · DB §3/§33/§34 · API §15/§37 · Deploy §20/§21 · Frontend §5/§36 · Backend §2/§35/§37 · Integrations §15/§39 · Roadmap §22/§44.

### 2. VPS deploy is always a single ZIP (`deploy-vps-contabo.mdc`)

Canonical script: `scripts/deploy-vps-backend.py` (WinRM → Contabo, `31.220.103.226` or `CONTABO_HOST`, Windows target `C:\ticketz\backend`).

Build package → **one ZIP** in `deploy-cache/` → upload only the ZIP (base64 chunked, SHA256) → `Expand-Archive` on the VPS.

**Forbidden:** per-file `upload_file()` loops over `dist/`/`scripts/`, `DEPLOY_USE_ZIP=false`, temp zips outside the repo (`/tmp/...`). The base64 "chunks" in the log are pieces of that one ZIP, not individual files. `DEPLOY_MODE=patch` (~70 AI/triage files) vs `full` chooses *what goes in the zip*, never *how it's sent*. Restart verification polls `/health` every 5s.

## Commands

### Backend (`cd backend`)

```bash
npm run dev:server        # ts-node-dev --inspect --respawn --transpile-only
npm run build             # tsc, no sourcemaps → dist/
npm run devbuild          # tsc with sourcemaps
npm run lint              # eslint src/**/*.ts
npx eslint --fix src/**/*.ts   # run after edits — Prettier is enforced as an ESLint error

npm run db:migrate        # sequelize db:migrate
npm run db:seed           # sequelize db:seed:all
npm run mark-seeds        # mark seeds executed without running (upgrades)

npm test                  # pretest: migrate+seed (NODE_ENV=test) → jest → posttest: undo all migrations
npx jest path/to/File.spec.ts          # single file
npx jest -t "test name"                # single test
npm run test:isolated     # full suite against the Docker test DB (see below)
```

`.sequelizerc` resolves config from `dist/config/database.js` — **build before running sequelize CLI in production**. `jest.config.js` has `bail: 1` and collects coverage from `src/services/**/*.ts`; tests are `**/__tests__/**/*.spec.ts`.

For `test:isolated`, bring up the isolated DB first:
```bash
docker compose -f docker-compose-test.yaml up -d   # Postgres :5433, Redis :6380
```

AI phase seeds/audits (most take `COMPANY_ID=<id>`):
```bash
npm run seed:ai-phase1        # orchestrator
npm run backfill:knowledge-assets / validate:knowledge-assets
npm run seed:ai-phase2-permissions / audit:ai-phase2
npm run seed:ai-phase3 / audit:ai-phase3          # memory + tools
npm run seed:ai-phase4 / audit:ai-phase4          # write tools + observability
npm run backfill:legacy-media / fix:agent-memory
npm run generate:i18nkeys     # extract translation keys into the DB
npm run wire:support-lines / audit:support-lines
```

### Frontend (`cd frontend`)

```bash
npm start                 # CRA dev server
npm run build             # GENERATE_SOURCEMAP=false
npm run builddev          # with sourcemaps
npx prettier --write src/ # run after edits (or just the files touched)
```

The Docker build sets `NODE_OPTIONS=--openssl-legacy-provider` — the React 17 toolchain needs legacy OpenSSL on Node 20+. Runtime config is generated from env at container start into `/var/www/public/config.json`.

### Docker

```bash
docker compose -f docker-compose-local.yaml up -d   # full stack: frontend :3000, backend :8080, PG, Redis
docker compose -f docker-compose-dev.yaml up -d     # infra only: Postgres + Redis + pgAdmin
docker compose -f docker-compose-acme.yaml up -d    # internet deploy (edit .env-backend-acme / .env-frontend-acme)
```

Default local login: `admin@ticketz.host` / `123456`. The backend container runs migrations + seeds before starting.

`scripts/dev-local.sh` provides `setup | real | check | infra | env-real | redis | backend | frontend` modes (Supabase + local Redis, backend on **:8082**, `AUTO_MIGRATE=false`). It contains real Supabase credentials — local use only.

## Architecture

### Backend startup — the "fast shell"

`server.ts` does **not** mount the full app synchronously. It creates the HTTP server on `appFast` and listens immediately, then in `setImmediate`:

```
server.ts → http.createServer(appFast) → listen
  → ensureCoreRoutes()      /health, /version, /public/*, /public-settings/*, POST /auth/login
  → initIO(server)          Socket.io
  → ensureHeavyRoutes()     routes/heavyRoutes.ts — all business routes, loaded async
  → i18nReady → seed*SettingsFromEnv → bootstrapAiPlatform → repairAiTicketStates → startQueueProcess
  → StartAllWhatsAppsSessions per company (unless WHATSAPP_AUTO_START=false)
  → WhatsApp watchdog kick (+15s)
```

Consequences: a route added to `heavyRoutes.ts` is not available for the first moments after boot (`/health` exposes `routeReadiness`); heavy modules are `await import(...)`ed, so top-level imports in that path affect cold start. `PORT` is required (process exits without it). `WHATSAPP_DEFER_START_MS` delays session startup; `AUTO_MIGRATE=true` applies migrations on boot (`MigrationService`).

`bootstrap.ts` loads `.env` (or `.env.test` when `NODE_ENV=test`) and is imported by `src/config/database.ts`, so env is populated before DB config is read.

### AI platform (`backend/src/services/AiServices/`)

The largest custom subsystem. Everything is gated:

- **Platform gate:** AI only runs when `AiPlatformState.aiFeaturesEnabled === true`, set by `bootstrapAiPlatform()` after schema + diagnostics checks. Write routes additionally use the `requireAiPlatformReady` middleware.
- **Double feature flags:** most subsystems need **both** a global env var and a per-company `Setting`, and default to OFF. Orchestrator: `AI_ORCHESTRATOR_ENABLED` + `aiOrchestratorEnabled`. Contact memory: `AI_CONTACT_MEMORY_ENABLED` + `aiContactMemoryEnabled`. Tools: `AI_TOOLS_ENABLED` + `aiToolsEnabled`. Write tools: `AI_WRITE_TOOLS_ENABLED` + `aiWriteToolsEnabled` (requires tools ON). Flags gate **runtime execution only** — e.g. `PUT /ai/agents/:agentId/tools` always persists bindings and returns `runtimeEnabled` + a warning when the runtime is off.

Inbound flow: `wbotMessageListener` → `AiReengagementService` (gate) → `AiInboundQueueService` (Bull, debounce/Redis buffer) → `ProcessInboundMessageService` → agent resolution → `MediaInboundResolver`/`AudioInboundResolver` (transcription, vision OCR) → handoff-keyword and sensitive-topic checks → `KnowledgeContextService` (RAG) → `ModelGateway.chatCompletion` → `SendWhatsAppMessage` → `AiConversationLog` + metrics. Low confidence or no trustworthy context routes to `HandoffToHumanService`.

RAG: `RetrievalEngine` (pgvector cosine/HNSW + keyword LIKE) → 24 candidates → similarity threshold (≥0.25, `AI_RAG_MIN_SIMILARITY`) → hybrid rerank (75% similarity / 20% query terms / 5% chapter-section) → neighbor chunks (±1, `AI_RAG_NEIGHBOR_WINDOW`) → top 8 into the system prompt. Embeddings `text-embedding-3-small`, 1536 dims, chunks 1800/200 chars (`RagConfig`). There is **no** fallback that injects the first N chunks by ID when retrieval finds nothing — empty context is intentional, and the brand fallback offers a concrete next step instead of inventing procedure.

Subfolders: `Triage/` (triage v2, handoff policy, completeness engine), `KnowledgeCms/` (versioned knowledge assets, atomic publish/swap, reindex), `ContactMemory/` (extraction, sanitization, policy, Bull queue), `tools/` (registry, executor, loop, idempotency, governance, sanitizers, `definitions/`), `providers/` (`AIProvider`, `OpenAIProvider`, `ProviderFactory` — Gemini via OpenAI-compatible endpoint), `metrics/`, `media/`, `pricing/`.

### Queues (`backend/src/queues.ts`, Redis via `REDIS_URI`)

`UserMonitor` (every minute) · `MessageQueue` (on demand) · `ScheduleMonitor` (**every 5s**) · `SendSacheduledMessages` · `WhatsappWatchdog` (every 5 min) · `CampaignQueue` (verify every 20s + on-demand process/dispatch) · `AiInboundQueue` (on demand, debounce) · `AiContactMemoryQueue` · AI metrics/ingestion queues. Standalone crons: `createInvoices` (every minute), `monitorHandoffSla` (every 15s).

### Real-time (`backend/src/libs/socket.ts`, `frontend/src/context/Socket/`)

JWT via `query.token`. Rooms are company-scoped: `company-{id}-mainchannel|admin|notification|handoff|{status}`, `queue-{id}-notification|handoff|pending`, `{ticketId}` (via `joinChatBox`), `user-{id}`, `super`, `backendlog`. Main events: `company-{id}-ticket`, `-appMessage`, `-handoff`, `-ai-copilot`, `-whatsappSession`, `-contact`, `-chat`, `-campaign`. Frontend cleanup uses `socket.off`, never `disconnect()`, and rejoins rooms on reconnect.

### Storage & media

`StorageService` with adapters for `backblaze` / `s3` / `r2` / `minio`, falling back to local `public/`. B2 buckets are private: operator-facing URLs go through `GET /media/access/:token` or the `/public/*` proxy (`Cache-Control: no-store`), and image URLs append `cb=<updatedAt>` to defeat cached broken responses. Media lifecycle/cleanup is env-driven (`MEDIA_RETENTION_DAYS`, `MEDIA_CLEANUP_*`).

### Multi-tenancy

Everything hangs off `Company`. `Ticket` has `status` ∈ `pending|open|closed`, `userId` (null = unassigned), `chatbot`, plus ~21 `ai*` fields. 78 models, ~196 migrations, 47 controllers, 37 route files.

## Conventions

- **Services are single-purpose modules** with a default-exported async function (`ShowTicketService`, `CreateMessageService`, …), grouped in `services/<Domain>Services/`. Follow that shape for new work.
- **i18n split:** backend messages sent to chat channels (WhatsApp etc.) must be translated **on the backend** with `_t(key, entity)` before sending — never emit raw keys to end users. API error responses stay as keys/codes and are translated by the frontend. Frontend UI strings always use `i18n.t("key")` from `../../translate/i18n`.
  - Backend translations live in the Postgres `Translation` table (`language`, `namespace`, `key`, `value`; default namespace `backend`) via a custom `TranslationsSequelize` i18next backend. `i18nReady` gates startup — don't emit translated strings before it resolves. `_t` resolves language from a `Ticket`, `Contact`, `Whatsapp`, `Company`, any model with `language`, or a raw string.
  - Frontend dictionaries are static: `frontend/src/translate/languages/*.js` (pt, pt_PT, en, es, fr, de, it, id), detection `localStorage` → `navigator`, fallback `en`, namespace `translations`.
- **Lint:** backend ESLint (`eslint.config.js`) runs Prettier as an error, prefers double quotes, `import/no-duplicates` is an error, `no-console` is allowed, unused vars ignored when `_`-prefixed.
- **Sentry** is initialized unconditionally in `app.ts` (empty DSN is harmless). `app.ts` also mounts `/public/*` from `uploadConfig.directory`.

## CI

- `.github/workflows/deploy-prod.yml` — **this is the production pipeline.** Its workflow `name:` is **`Publicar Produção`**, which is a contract with the Zheus governance tooling (`gh workflow run "Publicar Produção" -f confirmar=PRODUCAO`) — do not rename it. The `confirmar` input is a real gate: on `workflow_dispatch` the job fails immediately unless it equals `PRODUCAO`; pushes to `main` carry no inputs and skip the gate. Push to `main` (paths `backend/**`, `frontend/**`, `api-worker/**`, `functions/**`, `scripts/**`) or `workflow_dispatch`. Builds the backend, ensures Cloudflare DNS, then deploys to the Contabo VPS with `DEPLOY_MODE=patch`, `SKIP_WHATSAPP_RESET=1`. Generates `gitinfo` from git metadata.
- `.github/workflows/build-docker.yml` — multi-arch (`amd64`/`arm64`) images on push to `fix/**`, `dev`, `test-**`, and `v*.*.*` tags. **Not triggered by `main`.** Publishes to `ghcr.io/<owner-lowercased>/ticketz-{backend,frontend}` — the namespace is derived from `github.repository_owner`, never hardcoded, because `GITHUB_TOKEN` only has `packages: write` on its own owner (hardcoding upstream's `ticketz-oss` made every push from this fork fail with `permission_denied`).

Production on the VPS runs the compiled `dist/` natively under NSSM (Windows), not the Docker images.

## License

AGPLv3. If the system is distributed, the source-code link must stay easily accessible to all users — default location is the "About Ticketz" screen.
