# Inteligência Artificial

Índice temático. **Conteúdo completo:** [`MANUAL_PLATAFORMA.md`](MANUAL_PLATAFORMA.md)

## Seções do manual

| Tópico | Seção |
|--------|-------|
| Visão geral IA | [§11 — Módulo de IA](MANUAL_PLATAFORMA.md#11-módulo-de-inteligência-artificial) |
| Fluxo inbound | [§27 — Fluxo IA](MANUAL_PLATAFORMA.md#27-fluxo-ia-inbound) |
| Handoff | [§30 — Handoff IA → humano](MANUAL_PLATAFORMA.md#30-fluxo-handoff-ia--humano) |
| Copilot | [§31 — Fluxo Copilot](MANUAL_PLATAFORMA.md#31-fluxo-copilot) |
| Playground | [§32 — Fluxo Playground](MANUAL_PLATAFORMA.md#32-fluxo-playground) |
| Env vars IA | [§38 — Variáveis de ambiente](MANUAL_PLATAFORMA.md#38-variáveis-de-ambiente--ia-e-storage) |
| Pontos de extensão | [§40 — Pontos de extensão](MANUAL_PLATAFORMA.md#40-pontos-de-extensão-existentes) |
| Schema / tabelas | [§33–§34](MANUAL_PLATAFORMA.md#33-banco-de-dados--módulo-ia) |

## Documentos complementares

- [`AI_SETUP.md`](AI_SETUP.md) — setup operacional
- [`AI_ARCHITECTURE_PLAN.md`](AI_ARCHITECTURE_PLAN.md) — roadmap Fase 1–2
- [`AI_PHASE1_REPORT.md`](AI_PHASE1_REPORT.md) — relatório técnico Fase 1 (orquestrador)
- [`AI_PHASE2_ARCHITECTURE.md`](AI_PHASE2_ARCHITECTURE.md) — spec oficial Fase 2 (CMS de ativos)
- [`AI_PHASE2_REPORT.md`](AI_PHASE2_REPORT.md) — relatório técnico Fase 2 (CMS)

## Fase 1 — Orquestrador (backend)

| Componente | Caminho |
|------------|---------|
| Orquestrador | `AiOrchestratorService.ts`, `AiSpecialistReplyService.ts` |
| Vínculo agente ↔ base | `AiAgentKnowledgeBaseService.ts`, model `AiAgentKnowledgeBase` |
| Routing log | model `AiRoutingLog` |
| Integração inbound | `ProcessInboundMessageService.ts` |
| Feature flag | `AI_ORCHESTRATOR_ENABLED` + setting `aiOrchestratorEnabled` |
| Migration | `20260718100000-ai-phase1-orchestrator.ts` |
| Scripts | `COMPANY_ID=<id> npm run seed:ai-phase1`, `audit:ai-phase1` |

## Fase 3 — Memória + Tools (backend)

| Componente | Caminho |
|------------|---------|
| Memória contato | `ContactMemory/` — policy, sanitizer, Bull queue |
| Tools | `tools/` — executor, loop, 4 pilot tools |
| Prompt | `AiPromptBuilder.ts` |
| Feature flags | `AI_CONTACT_MEMORY_ENABLED`, `AI_TOOLS_ENABLED` + settings |
| Migration | `20260730100000-ai-phase3-memory-tools.ts` |
| Scripts | `seed:ai-phase3`, `audit:ai-phase3` |

Ver [`AI_PHASE3_ARCHITECTURE.md`](AI_PHASE3_ARCHITECTURE.md) e [`AI_PHASE3_REPORT.md`](AI_PHASE3_REPORT.md).

## Fase 2 — Knowledge CMS (backend)

| Componente | Caminho |
|------------|---------|
| Serviços CMS | `backend/src/services/AiServices/KnowledgeCms/` |
| Fila ingestão | `AiKnowledgeIngestionQueueService.ts` — jobs `index-asset-version`, `publish-asset-swap`, `reindex-asset`, `unpublish-asset`, `cleanup-asset-version` |
| Feature flag | `AI_KB_CMS_ENABLED` + setting `aiKbCmsEnabled` |
| Legacy adapter | `LegacyKnowledgeAdapter.ts` — rotas `/ai/documents/*` |
| RAG policy | `KnowledgeRetrievalPolicy.ts` + `RetrievalEngine.ts` |

Env vars ingestão: `AI_KB_INGESTION_CONCURRENCY`, `AI_KB_INGESTION_MAX_ATTEMPTS`, `AI_KB_INGESTION_BACKOFF_MS`

## Diretório no código

`backend/src/services/AiServices/` — 47+ serviços  
`backend/src/routes/aiRoutes.ts` — API admin  
`backend/src/controllers/TicketAiController.ts` — ações IA no ticket

## Regra de atualização

Alterações em IA exigem §11, §27–§32, §33–§34, §38, §40–§41. Ver [`/.documentation-rules.md`](.documentation-rules.md).
