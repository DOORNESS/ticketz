# Changelog — Documentação Ticketz

Histórico de alterações em `MANUAL_PLATAFORMA.md` e estrutura `docs/`.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [1.4.3] — 2026-07-19

### Adicionado (Triagem IA v2 + áudio/copiloto)

- Módulo `backend/src/services/AiServices/Triage/` (completude do caso, política de handoff, timeline, read receipt, transcrição condicional)
- Migration `20260719100000-ai-triage-v2-professional-flow.ts`
- Handoff operacional vs definitivo; preservação de `aiHandoffOriginalReason`
- Correção áudio outbound do painel (validação ffmpeg + Opus/PTT)
- Copiloto on-demand via `POST /tickets/:id/ai/copilot`
- Manual §30 (triagem v2), §31 (copiloto ampliado)

---

## [1.4.2] — 2026-07-18

### Validado (Fases 3 + 4)

- Registro síncrono de tools (sem `setImmediate`) + bootstrap explícito
- 103 testes backend PASS · 96 testes IA expandidos PASS
- `docker-compose-test.yaml` + `npm run test:isolated`
- Runbook: [`AI_PHASE34_ROLLOUT_RUNBOOK.md`](AI_PHASE34_ROLLOUT_RUNBOOK.md)
- Relatório final: [`AI_PHASE34_FINAL_VALIDATION_REPORT.md`](AI_PHASE34_FINAL_VALIDATION_REPORT.md)

---

## [1.4.1] — 2026-07-18

### Consolidado (Fases 3 + 4)

- Idempotência persistente write tools (`AiToolIdempotencyRecords` + Redis lock)
- Semântica correta memória agente: `agent_note` / `unverified` — promoção `human_verified` só via API autenticada
- Migration `20260818100000-ai-phase34-consolidation.ts`
- `AI_METRICS_V2_ENABLED` default **false**
- Script `fix:agent-memory` para correção de dados legados
- Relatório: [`AI_PHASE34_CONSOLIDATION_REPORT.md`](AI_PHASE34_CONSOLIDATION_REPORT.md)
- Spec Fase 4: [`AI_PHASE4_ARCHITECTURE.md`](AI_PHASE4_ARCHITECTURE.md)

---

## [1.4.0] — 2026-07-18

### Adicionado (Fase 4 — Operações + Observabilidade)

- Write tools governadas (5) + `ToolGovernancePolicy` + idempotência persistente
- `AiMetricsSnapshots`, aggregator, cache dashboard, fila `AiMetricsQueue`
- Provider **Gemini** (OpenAI-compatible endpoint)
- `UnifiedMediaPersistenceService` + `MessageMediaFiles.direction`
- Migration `20260815100000-ai-phase4-operations-observability.ts`
- `AI_MIGRATION_NAMES` completo (9 migrations IA)
- Scripts: `seed:ai-phase4`, `audit:ai-phase4`, `backfill:legacy-media`
- Relatório: [`AI_PHASE4_REPORT.md`](AI_PHASE4_REPORT.md)
- Frontend: memória contato, timeline tools, dashboard Phase 4, playground toggles

---

## [1.3.0] — 2026-07-18

### Adicionado (Fase 3 — Memória + Ferramentas)

- Serviços `ContactMemory/` — memória por contato, verificação, LGPD, fila Bull `AiContactMemoryQueue`
- Framework `tools/` — executor, loop, 4 tools piloto, logs sanitizados, handoff idempotente
- Migration `20260730100000-ai-phase3-memory-tools.ts`
- `AiPromptBuilder.ts` — prompt unificado + anti prompt-injection
- Scripts: `COMPANY_ID=<id> npm run seed:ai-phase3`, `audit:ai-phase3`
- Spec: [`AI_PHASE3_ARCHITECTURE.md`](AI_PHASE3_ARCHITECTURE.md)
- Relatório: [`AI_PHASE3_REPORT.md`](AI_PHASE3_REPORT.md)
- Frontend: toggles de tools em Agentes; métricas tools no Playground

---

## [1.2.1] — 2026-07-18

### Adicionado (governança documental)

- `.cursor/rules/documentation-rules.mdc` — rule permanente versionada no repositório
- `docs/.documentation-rules.md` — spec completa de documentação
- Índices temáticos: `architecture.md`, `backend.md`, `deployment.md`, `frontend.md`, `integrations.md`
- `AGENTS.md` — guia para agentes de código
- Sincronização de índices com Fases 1 e 2 (`ai.md`, `database.md`, `rag.md`, `roadmap.md`)

---

## [1.2.0] — 2026-07-18

### Adicionado (Fase 2 — Knowledge CMS backend)

- Serviços `backend/src/services/AiServices/KnowledgeCms/` — domínios, categorias, assets, versionamento, publicação atômica, fila Bull `AiKnowledgeIngestionQueue`
- Controllers: `KnowledgeDomainController`, `KnowledgeCategoryController`, `KnowledgeAssetController`
- Rotas `/ai/knowledge-domains`, `/ai/categories`, `/ai/assets/*` em `aiRoutes.ts`
- `RetrievalEngine` — filtro RAG CMS ON via `KnowledgeRetrievalPolicy`
- Scripts: `COMPANY_ID=<id> npm run backfill:knowledge-assets`, `COMPANY_ID=<id> npm run validate:knowledge-assets`, `seed:ai-phase2-permissions`, `audit:ai-phase2`
- Spec: [`AI_PHASE2_ARCHITECTURE.md`](AI_PHASE2_ARCHITECTURE.md)
- Relatório: [`AI_PHASE2_REPORT.md`](AI_PHASE2_REPORT.md)
- Frontend: `/ai/assets`, `/ai/knowledge-domains`, CMS lifecycle UI

---

## [1.1.1] — 2026-07-18

### Adicionado

- `.cursor/rules/documentation-rules.mdc` — rule permanente (`alwaysApply: true`)
- `docs/.documentation-rules.md` — spec completa de documentação
- Índices temáticos: `architecture.md`, `ai.md`, `rag.md`, `database.md`, `api.md`, `deployment.md`, `frontend.md`, `backend.md`, `integrations.md`, `roadmap.md`
- Estrutura de documentação no cabeçalho de `MANUAL_PLATAFORMA.md`

---

## [1.1.0] — 2026-07-18

### Adicionado

- `docs/MANUAL_PLATAFORMA.md` v1.1 — manual oficial auditado contra o código
- Parte II: diagramas Mermaid, fluxos IA/RAG/handoff/copilot/playground, schema IA
- Parte III: relatório de auditoria (§45), aderência 94%
- Estrutura de índices temáticos: `architecture.md`, `ai.md`, `rag.md`, etc.
- `.cursor/rules/documentation-rules.mdc` — rule permanente (`alwaysApply: true`)
- `docs/.documentation-rules.md` — spec completa de documentação

### Corrigido (auditoria v1.0 → v1.1)

- Debounce IA (`AI_QUEUE_DEBOUNCE_MS` padrão 0)
- Gateways de pagamento (Efi + Owen, não Mercado Pago no OSS)
- Ordem IA vs chatbot no fluxo WhatsApp
- Crons Bull (ScheduleMonitor 5s, invoice cada minuto)
- Visibilidade menu admin vs atendente
- To-Do List (localStorage only)

---

## [1.0.0] — 2026-07-18

### Adicionado

- Primeira versão do manual (`docs/MANUAL_PLATAFORMA.md`) — 24 seções

---

## Como registrar alterações

Ao concluir tarefa estrutural, adicionar entrada no topo:

```markdown
## [X.Y.Z] — AAAA-MM-DD

### Adicionado / Alterado / Corrigido / Removido

- Descrição — seções §N afetadas
```

Incrementar versão no cabeçalho de `MANUAL_PLATAFORMA.md`.
