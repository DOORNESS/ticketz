# Relatório Técnico — Fase 4: Operações Autônomas + Observabilidade

**Data:** 2026-07-18  
**Status:** Consolidado — feature flags **desligadas por padrão**  
**Produção:** Não deployado · **push:** não realizado  
**Spec:** [`AI_PHASE4_ARCHITECTURE.md`](AI_PHASE4_ARCHITECTURE.md)  
**Consolidação:** [`AI_PHASE34_CONSOLIDATION_REPORT.md`](AI_PHASE34_CONSOLIDATION_REPORT.md)

---

## 1. Resumo

A Fase 4 conecta Fases 1–3 com **tools de escrita governadas**, **idempotência persistente**, **observabilidade v2**, **UI admin** (memória + timeline), **storage hardening**, **provider Gemini** e **`AI_MIGRATION_NAMES` completo (10 migrations IA).

---

## 2. Feature flags

| Recurso | Env | Setting | Default |
|---------|-----|---------|---------|
| Write tools | `AI_WRITE_TOOLS_ENABLED` | `aiWriteToolsEnabled` | OFF |
| Metrics v2 | `AI_METRICS_V2_ENABLED` | — | **OFF** |
| Tools read (F3) | `AI_TOOLS_ENABLED` | `aiToolsEnabled` | OFF |
| Memória (F3) | `AI_CONTACT_MEMORY_ENABLED` | `aiContactMemoryEnabled` | OFF |

---

## 3. Migrations

| Arquivo | Conteúdo |
|---------|----------|
| `20260815100000-ai-phase4-operations-observability.ts` | `AiMetricsSnapshots`, audit cols, `MessageMediaFiles.direction` |
| `20260818100000-ai-phase34-consolidation.ts` | `AiToolIdempotencyRecords`, idempotência/audit em logs |

---

## 4. Write tools (5)

| Tool | Ação |
|------|------|
| `add_ticket_tag` | Tag existente no ticket (allowlist agente) |
| `update_ticket_priority` | Campo oficial `Ticket.aiPriority` |
| `transfer_ticket_queue` | Fila destino permitida ao agente |
| `create_contact_memory_note` | Nota **`agent_note` / `unverified` / `source: agent`** |
| `schedule_followup` | Agendamento WhatsApp com limites anti-spam |

Governança: `ToolGovernancePolicy` + `ToolPersistentIdempotencyService` + logs sanitizados.

---

## 5. Observabilidade

- `AiMetricsAggregatorService` — métricas read/write separadas
- `AiMetricsSnapshots` + fila Bull `AiMetricsQueue`
- Cache Redis dashboard (fallback snapshot)
- Endpoints: `/ai/dashboard/timeseries`, `/ai/dashboard/agents`

---

## 6. Frontend

- `ContactAiMemoryPanel` — tipos visuais (agente, humano, verificado)
- `TicketAiTimeline` — execuções de tools
- Dashboard Phase 4 + Playground toggles + AiAgents risk badges

---

## 7. Comandos

```bash
cd backend && npm run build && npm run db:migrate
COMPANY_ID=1 npm run seed:ai-phase4
COMPANY_ID=1 npm run audit:ai-phase4
COMPANY_ID=1 npm run fix:agent-memory -- --dry-run
COMPANY_ID=1 npm run backfill:legacy-media -- --dry-run
```

---

## 8. Ativação homologação

```env
AI_WRITE_TOOLS_ENABLED=true
AI_TOOLS_ENABLED=true
AI_CONTACT_MEMORY_ENABLED=true
AI_METRICS_V2_ENABLED=true
```

Settings: `aiWriteToolsEnabled=enabled`, `aiToolsEnabled=enabled`, `aiContactMemoryEnabled=enabled`
