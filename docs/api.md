# API — Endpoints

Índice temático. **Conteúdo completo:** [`MANUAL_PLATAFORMA.md`](MANUAL_PLATAFORMA.md)

## Seções do manual

| Tópico | Seção |
|--------|-------|
| API externa e integrações | [§15 — API externa](MANUAL_PLATAFORMA.md#15-api-externa-e-integrações) |
| Serviços principais | [§37 — Serviços](MANUAL_PLATAFORMA.md#37-serviços-principais-e-responsabilidades) |
| Rotas IA | [§11 — Módulo IA](MANUAL_PLATAFORMA.md#11-módulo-de-inteligência-artificial) |
| Auth e middlewares | [§4 — Permissões](MANUAL_PLATAFORMA.md#4-perfis-de-usuário-e-permissões) |

## Rotas montadas (`heavyRoutes.ts`)

32 módulos incluindo: `ticketRoutes`, `messageRoutes`, `whatsappRoutes`, `aiRoutes`, `contactRoutes`, `dashboardRoutes`, etc.

## Endpoints públicos (fast shell)

| Método | Rota |
|--------|------|
| GET | `/health`, `/version` |
| GET | `/public-settings/:key` |
| POST | `/auth/login` |
| GET/POST | `/escalation/:token` (formulário público; aceita a origem do próprio `BACKEND_URL` no CORS) |

## API externa

| Método | Rota | Auth |
|--------|------|------|
| POST | `/api/messages/send` | `tokenAuth` (token conexão WA) |
| GET | `/contacts` | `apiTokenAuth` (Setting `apiToken`) |

## API IA (admin)

Prefixo `/ai/*` — ver lista completa em `backend/src/routes/aiRoutes.ts` e §11 do manual.

**Fase 2 (CMS ON):** domínios (`/ai/knowledge-domains`), categorias (`/ai/categories`, `/ai/knowledge-bases/:baseId/categories`), ativos (`/ai/assets/*`). Legado `/ai/documents/*` delega via `LegacyKnowledgeAdapter`.

Rotas de ticket + IA: `/tickets/:id/ai/*` em `backend/src/routes/ticketRoutes.ts`.

## Regra de atualização

Novo endpoint → §15, §37, seção de domínio (§7–§14). Ver [`/.documentation-rules.md`](.documentation-rules.md).
