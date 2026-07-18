# Banco de dados

Índice temático. **Conteúdo completo:** [`MANUAL_PLATAFORMA.md`](MANUAL_PLATAFORMA.md)

## Seções do manual

| Tópico | Seção |
|--------|-------|
| Conceitos (Company, Ticket, etc.) | [§3 — Conceitos fundamentais](MANUAL_PLATAFORMA.md#3-conceitos-fundamentais) |
| Módulo IA (tabelas) | [§33 — Banco IA](MANUAL_PLATAFORMA.md#33-banco-de-dados--módulo-ia) |
| ER diagram IA | [§34 — Relação tabelas IA](MANUAL_PLATAFORMA.md#34-relação-entre-tabelas-ia) |

## Localização no código

- Models: `backend/src/models/` (56 arquivos)
- Migrations: `backend/src/database/migrations/`
- Seeds: `backend/src/database/seeds/`
- CLI: `npm run db:migrate`, `npm run db:seed` (requer build em prod)

## Migrations IA (9 arquivos)

| Migration | Conteúdo |
|-----------|----------|
| `20260707100000-create-ai-and-knowledge-tables` | Tabelas base + pgvector |
| `20260708120000-add-ai-agent-ack-fields` | ACK agente |
| `20260709120000-add-ai-operational-flow-fields` | Campos operacionais Ticket |
| `20260710120000-add-ai-professional-features` | Copilot, métricas |
| `20260711120000-ai-gen2-intelligence` | Replay, gen2 |
| `20260718100000-ai-phase1-orchestrator` | Orquestrador, `AiAgentKnowledgeBases`, `AiRoutingLogs` |
| `20260725100000-ai-phase2-knowledge-cms` | Domínios, categorias, assets, versões, permissões, jobs |
| `20260730100000-ai-phase3-memory-tools` | Memória contato, agent tools, tool execution logs |

## Variável

- `AUTO_MIGRATE=true` — aplica migrations na subida (`MigrationService.ts`)
- `DB_SCHEMA` — schema Postgres (padrão `ticketz`)

## Regra de atualização

Nova migration ou model → §3, §33–§34, §41. Ver [`/.documentation-rules.md`](.documentation-rules.md).
