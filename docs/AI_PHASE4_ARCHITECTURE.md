# Especificação Oficial — Fase 4: Operações Autônomas + Observabilidade

**Data:** 2026-07-18  
**Status:** Implementado — flags **desligadas por padrão**  
**Depende de:** Fases 1–3  
**Consolidação:** migration `20260818100000-ai-phase34-consolidation.ts`

---

## 1. Objetivo

Conectar orquestrador, memória e tools read (Fase 3) com:

- **5 write tools** governadas e idempotentes (persistência DB + Redis lock)
- **Observabilidade** (snapshots, aggregator, cache Redis, dashboard v2)
- **UI admin** (timeline de tools, painel memória integrado)
- **Provider Gemini** (endpoint OpenAI-compatible)
- **Storage hardening** (`UnifiedMediaPersistenceService`)

Sem regressão quando flags desligadas.

---

## 2. Feature flags

| Recurso | Env | Setting empresa | Default |
|---------|-----|-----------------|---------|
| Write tools | `AI_WRITE_TOOLS_ENABLED` | `aiWriteToolsEnabled` | `false` / `disabled` |
| Metrics v2 | `AI_METRICS_V2_ENABLED` | — | `false` |
| Tools read (F3) | `AI_TOOLS_ENABLED` | `aiToolsEnabled` | `false` |
| Memória (F3) | `AI_CONTACT_MEMORY_ENABLED` | `aiContactMemoryEnabled` | `false` |

Write tools exigem cadeia completa: global write ON → tools ON → setting empresa write ON → tool habilitada no agente.

---

## 3. Migrations

| Migration | Conteúdo |
|-----------|----------|
| `20260815100000-ai-phase4-operations-observability` | `AiMetricsSnapshots`, colunas audit em `AiToolExecutionLogs`, `MessageMediaFiles.direction` |
| `20260818100000-ai-phase34-consolidation` | `AiToolIdempotencyRecords`, colunas audit/idempotência em logs |

---

## 4. Write tools (5)

| Tool | Risco | Idempotência |
|------|-------|--------------|
| `add_ticket_tag` | write | DB + Redis |
| `update_ticket_priority` | write | DB + Redis (`Ticket.aiPriority`) |
| `transfer_ticket_queue` | write | DB + Redis |
| `create_contact_memory_note` | write | DB + Redis — **`agent_note` / `unverified` / `source: agent`** |
| `schedule_followup` | write (elevado) | DB + Redis + limites rate/dias |

`request_human_handoff` (Fase 3) também usa idempotência persistente via executor.

---

## 5. Governança (`ToolGovernancePolicy`)

Validações em cadeia:

1. Flags globais e por empresa
2. Agente, ticket, contato pertencem à empresa
3. Ticket não encerrado; humano ativo bloqueia writes
4. Tag/fila dentro de allowlist do agente
5. Schema estrito (`ToolInputValidator`) — rejeita propriedades extras
6. IDs críticos (`companyId`, `ticketId`, etc.) **somente do contexto servidor**

---

## 6. Idempotência persistente

`ToolPersistentIdempotencyService`:

```
Redis lock (curto prazo)
  + AiToolIdempotencyRecords (unique companyId + idempotencyKey)
  + transação Sequelize
  + log com correlationId, attempt, reusedResult
```

Protege contra: restart, TTL Redis, retry de fila, concorrência.

---

## 7. Auditoria (`AiToolExecutionLog`)

Campos: `riskLevel`, `mutationTarget`, `mutationTargetId`, `previousStateSanitized`, `newStateSanitized`, `idempotencyKey`, `correlationId`, `attempt`, `reusedResult`, `reversible`, `executedByAgentId`.

PII e segredos sanitizados via `ToolLogSanitizer`.

---

## 8. Observabilidade

- `AiMetricsAggregatorService` — read/write tools separados, memória, orquestrador, custo
- Fila Bull `AiMetricsQueue` + tabela `AiMetricsSnapshots`
- Cache Redis dashboard (fallback snapshot se Redis indisponível)
- Endpoints: `/ai/dashboard/timeseries`, `/ai/dashboard/agents`
- Dashboard degradado com flags OFF (sem quebrar UI)

---

## 9. Provider Gemini

Implementado em `OpenAIProvider.ts` via base URL configurável (`AI_GEMINI_BASE_URL`). Tool calling suportado quando modelo configurado suporta; caso contrário erro controlado ou fallback para provider primário.

OpenAI permanece provider padrão — sem remoção de funcionalidade.

---

## 10. Storage

`UnifiedMediaPersistenceService` registra `MessageMediaFiles` de forma idempotente (hash + messageId). Hook em `saveMediaFile.ts`. Backfill: `npm run backfill:legacy-media -- --dry-run`.

---

## 11. Frontend

- `TicketAiTimeline` — execuções de tools por ticket
- `ContactAiMemoryPanel` — memória (Fase 3 UI finalizada na Fase 4)
- Dashboard Phase 4, Playground toggles, badges de risco em Agentes

---

## 12. Scripts

```bash
cd backend && npm run build && npm run db:migrate
COMPANY_ID=1 npm run seed:ai-phase4
COMPANY_ID=1 npm run audit:ai-phase4
COMPANY_ID=1 npm run fix:agent-memory -- --dry-run   # corrige notas agente mal rotuladas
COMPANY_ID=1 npm run backfill:legacy-media -- --dry-run
```

---

## 13. Ativação homologação

```env
AI_CONTACT_MEMORY_ENABLED=true
AI_TOOLS_ENABLED=true
AI_WRITE_TOOLS_ENABLED=true
AI_METRICS_V2_ENABLED=true
```

Settings: `aiContactMemoryEnabled`, `aiToolsEnabled`, `aiWriteToolsEnabled` = `enabled`.

---

## 14. Limitações conhecidas

- Rollback automático de write tools não implementado — reversão manual via logs auditáveis
- Gemini: paridade depende do modelo/endpoint configurado
- `schedule_followup` limitado por políticas de rate e horário comercial da empresa
