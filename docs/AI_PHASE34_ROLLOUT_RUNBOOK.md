# Runbook — Ativação Gradual Fases 3 e 4 (IA Ticketz)

**Versão:** 1.0 · 2026-07-18  
**Escopo:** memória de contato, tools read/write, observabilidade v2  
**Pré-requisito:** commits `541d277` + `02b95df` (+ fix de validação, se aplicável)

---

## 1. Pré-requisitos

- [ ] Migrations IA aplicadas (`npm run build && npm run db:migrate`)
- [ ] Redis operacional (`REDIS_URI`)
- [ ] Provider LLM configurado (OpenAI primário; Gemini opcional)
- [ ] Scripts de auditoria executados com sucesso:
  ```bash
  COMPANY_ID=<id> npm run audit:ai-phase3
  COMPANY_ID=<id> npm run audit:ai-phase4
  ```
- [ ] Bootstrap registra tools **antes** de filas/workers (`bootstrapAiPlatform` + `startQueueProcess`)

---

## 2. Feature flags (default OFF)

| Flag | Default | Setting empresa |
|------|---------|-----------------|
| `AI_CONTACT_MEMORY_ENABLED` | `false` | `aiContactMemoryEnabled=disabled` |
| `AI_TOOLS_ENABLED` | `false` | `aiToolsEnabled=disabled` |
| `AI_WRITE_TOOLS_ENABLED` | `false` | `aiWriteToolsEnabled=disabled` |
| `AI_METRICS_V2_ENABLED` | `false` | — |

**Regra:** flag global ON + setting OFF = funcionalidade **bloqueada**.

---

## 3. Ordem de ativação recomendada

```text
1. AI_METRICS_V2_ENABLED=true          (observabilidade, sem mutação)
2. AI_CONTACT_MEMORY_ENABLED=true       (+ setting aiContactMemoryEnabled)
3. AI_TOOLS_ENABLED=true                (+ setting aiToolsEnabled)
4. AI_WRITE_TOOLS_ENABLED=true          (+ setting aiWriteToolsEnabled)
```

### Write tools (por empresa → por agente)

1. Uma empresa piloto em homologação
2. Um agente piloto com tools mínimas
3. Habilitar na ordem:
   - `add_ticket_tag`
   - `update_ticket_priority`
   - `transfer_ticket_queue`
   - `create_contact_memory_note`
   - `schedule_followup` (**último** — maior risco operacional)

**Nunca** ativar writes globalmente para todas as empresas de uma vez.

---

## 4. Smoke tests pós-ativação

```bash
# Tools registradas (síncrono, sem setImmediate)
cd backend && node -e "require('./dist/bootstrap'); const { ensurePilotToolsRegistered } = require('./dist/services/AiServices/tools/registerPilotTools'); ensurePilotToolsRegistered(); console.log('tools OK');"

# Audits
COMPANY_ID=1 npm run audit:ai-phase3
COMPANY_ID=1 npm run audit:ai-phase4

# Memória agente sem human_verified incorreto
COMPANY_ID=1 npm run fix:agent-memory -- --dry-run
```

### UI

- Painel memória no drawer de contato
- Timeline no ticket
- Dashboard Phase 4 (degradado com metrics OFF)
- Playground com toggles

### Fluxo mínimo

1. Inbound texto → orquestrador → especialista
2. Tool read executada → log na timeline
3. Write permitida → idempotência (segunda chamada reutiliza resultado)
4. Write bloqueada (flag OFF) → erro controlado

---

## 5. Rollback

| Ação | Comando / procedimento |
|------|------------------------|
| Desligar writes | `AI_WRITE_TOOLS_ENABLED=false` + setting `disabled` |
| Desligar tools | `AI_TOOLS_ENABLED=false` |
| Desligar memória | `AI_CONTACT_MEMORY_ENABLED=false` |
| Desligar metrics v2 | `AI_METRICS_V2_ENABLED=false` |
| Cancelar follow-ups | UI Schedules / tabela `Schedules` por contato |
| Corrigir memória agente | `npm run fix:agent-memory -- --dry-run` then `--apply` |

Rollback **não** desfaz mutações já executadas — usar logs `AiToolExecutionLogs` + `AiToolIdempotencyRecords`.

---

## 6. Troubleshooting

| Sintoma | Verificação |
|---------|-------------|
| Tool não encontrada | `ensurePilotToolsRegistered()` no bootstrap; logs startup |
| Write duplicada | `AiToolIdempotencyRecords` por `idempotencyKey` |
| Memória human_verified incorreta | `fix:agent-memory` |
| Dashboard vazio | metrics v2 flag; snapshots em `AiMetricsSnapshots` |
| Gemini sem tools | fallback OpenAI; erro controlado no provider |
| Redis down | idempotência DB persiste; metrics degradam para snapshot |

---

## 7. Métricas de acompanhamento

- Taxa sucesso/falha tools (read vs write separados)
- `reusedResult=true` em logs (idempotência ativa)
- Latência média por tool
- Handoffs por agente
- Memórias `agent_note` vs `human_verified`
- Custo tokens (dashboard v2)

---

## 8. Critérios para interromper rollout

- Duplicação de tags/filas/prioridade detectada
- Follow-up duplicado ao contato
- Memória sensível promovida sem humano
- Write executada com humano ativo no ticket
- Spike de erros `write_tools_disabled` ignorados pelo modelo
- Logs com PII não sanitizada

---

## 9. Auditar idempotência

```sql
SELECT "idempotencyKey", "toolId", "success", "createdAt"
FROM ticketz."AiToolIdempotencyRecords"
WHERE "companyId" = :companyId
ORDER BY "createdAt" DESC
LIMIT 50;
```

Cruzamento com `AiToolExecutionLogs.reusedResult`.

---

## 10. Verificar tools registradas

Via audit script ou API `/ai/tools` (requer auth admin). Esperado: 9 tools (4 read/handoff + 5 write).

Registro ocorre em:

- `bootstrapAiPlatform()` — API startup
- `startQueueProcess()` — workers Bull
- `ensureToolsLoaded()` — primeira lookup no registry (síncrono)

**Não** depender de `setImmediate` para registro.
