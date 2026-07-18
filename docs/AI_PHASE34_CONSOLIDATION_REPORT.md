# Relatório de Consolidação — Fases 3 e 4 (IA Ticketz)

**Data:** 2026-07-18  
**Branch:** `main` (4 commits Fases 1–2 + governança; Fases 3–4 consolidadas em 2 commits locais)  
**Homologação:** migrations aplicadas · seeds/audits OK  
**Push / deploy produção:** **não realizados**

---

## 1. Resumo executivo

Consolidação técnica completa das Fases 3 (memória de contato + tools read) e 4 (write tools + observabilidade) concluída. Correções críticas aplicadas:

- Memória criada por IA usa `agent_note` / `unverified` / `source: agent` — nunca `human_verified`
- Idempotência persistente para write tools (Redis lock + `AiToolIdempotencyRecords` + constraint única + transação)
- Governança ampliada com validação de contexto servidor e schema estrito
- Registro lazy de tools (corrige dependência circular em scripts audit/seed)
- Feature flags permanecem **desligadas por padrão**, incluindo `AI_METRICS_V2_ENABLED=false`

Build backend/frontend OK · 84 testes IA OK · audits Fase 3 e 4 PASS.

---

## 2. Estado inicial encontrado

| Item | Estado |
|------|--------|
| Fases 1–2 | 4 commits locais à frente de `origin/main` |
| Fases 3–4 | Implementadas porém **100% uncommitted** |
| Working tree | ~70 arquivos modificados/novos |
| Testes | 1 suite falhando (`ToolGovernancePolicy` — path mock) |
| Audit Fase 3 | Crash por dependência circular em `registerPilotTools` |
| Docs Fase 4 | `create_contact_memory_note` documentada incorretamente como `human_verified` |
| Metrics v2 | Documentação indicava default ON; código já estava OFF |

### Arquivos locais excluídos dos commits

| Arquivo | Motivo |
|---------|--------|
| `scripts/dev-local.sh` | Script dev local |
| `frontend/public/config-dev.json` | Config local |
| `scripts/diag-vps-iis.py`, `fix-vps-bind-local.py`, `restore-vps-prod-env.py` | Scripts VPS |
| `backend/scripts/check-user.js`, `reset-test-environment.js`, `set-user-password.js` | Utilitários locais |
| `package-lock.json` (root) | Sem `package.json` root |
| `backend/.env` | Credenciais (gitignored) |

Nenhum destes é dependência de build ou teste CI.

---

## 3. Inconsistências identificadas

1. **`create_contact_memory_note`** gravava `human_note` + `human_verified` + `source: human`
2. **Idempotência write** dependia apenas de Redis (`ToolIdempotencyStore`)
3. **`registerPilotTools`** efeito colateral síncrono causava tool `undefined` em audit (circular import)
4. **`ToolGovernancePolicy.spec.ts`** — paths mock incorretos (3 vs 4 níveis)
5. **`ToolInputValidator`** — `for...of` violava ESLint `no-restricted-syntax`
6. **Audit Fase 3** esperava exatamente 4 tools totais (ignorava write tools da Fase 4)
7. **Documentação Fase 4** — defaults e semântica memória desatualizados
8. **`AI_PHASE4_ARCHITECTURE.md`** — ausente

---

## 4. Correções realizadas

### Memória agente
- `ContactAiMemoryPolicy.ts` — tipo `agent_note`, source `agent`; bloqueio promoção agente → `human_verified`
- `CreateContactMemoryNoteTool.ts` — semântica correta
- `ContactAiMemoryController.store` — API autenticada força `human_note` + `human_verified` + auditoria
- `fixAgentMemorySemantics.ts` + `npm run fix:agent-memory`
- Frontend `ContactAiMemoryPanel` — labels `agent_note`

### Idempotência persistente
- Migration `20260818100000-ai-phase34-consolidation.ts`
- `ToolPersistentIdempotencyService.ts` — Redis lock + registro DB + transação
- `ToolExecutorService.ts` — orquestra governança → validação → idempotência → audit log
- Write tools simplificadas (sem Redis-only idempotency interna)

### Governança e segurança
- `ToolGovernancePolicy.ts` — 12 condições incl. humano ativo, ticket fechado, allowlist tag/fila
- `ToolInputValidator.ts` — schema estrito, rejeita props extras
- Prompt injection — wrapper `[OPERATIONAL_DATA]` mantido em sanitizers + testes

### Infraestrutura
- `registerPilotTools.ts` — lazy registration + `setImmediate` + `ensurePilotToolsRegistered()`
- `ToolRegistry.ts` — carrega tools on-demand
- Audit scripts atualizados

---

## 5. Migrations criadas ou alteradas

| Migration | Status |
|-----------|--------|
| `20260730100000-ai-phase3-memory-tools` | Nova — aplicada homolog |
| `20260815100000-ai-phase4-operations-observability` | Nova — aplicada homolog |
| `20260818100000-ai-phase34-consolidation` | Nova — aplicada homolog |

`AI_MIGRATION_NAMES` atualizado (10 migrations IA). Nenhuma migration existente reescrita de forma incompatível.

---

## 6. Modelo final de memória

| Campo | Valor — nota IA | Valor — nota humana (API admin) |
|-------|-----------------|----------------------------------|
| `memoryType` | `agent_note` | `human_note` |
| `verificationStatus` | `unverified` | `human_verified` |
| `source` | `agent` | `human` |

Promoção para `human_verified` exige `actorUserId` autenticado + log em `ContactAiMemoryLogs` (status anterior/novo, origem, motivo).

Categorias sensíveis (pagamento, plano, identidade) bloqueadas para inferência/promoção automática.

---

## 7. Modelo final de idempotência

```
Chave determinística (toolId + companyId + ticketId + hash params)
  → Redis SET NX (lock curto)
  → SELECT AiToolIdempotencyRecords FOR UPDATE
  → INSERT unique (companyId, idempotencyKey) OR reuse result
  → EXEC tool in transaction
  → UPDATE record + AiToolExecutionLog (idempotencyKey, correlationId, attempt, reusedResult)
  → RELEASE Redis lock
```

Válido após: restart, TTL Redis, retry fila, concorrência, timeout.

Tools cobertas: 5 write + `request_human_handoff`.

---

## 8. Governança das tools

`ToolGovernancePolicy.canExecuteTool` valida:

1. `AI_TOOLS_ENABLED` + setting empresa
2. Write: `AI_WRITE_TOOLS_ENABLED` + setting empresa
3. Agente/ticket/contato da mesma empresa
4. Tool habilitada no agente (`AiAgentTools`)
5. Ticket ativo; humano ativo bloqueia writes
6. Tag/fila dentro de allowlist
7. Parâmetros via `ToolInputValidator` (sem props extras)
8. IDs críticos exclusivamente do `ToolExecutionContext` servidor

---

## 9. Segurança e prompt injection

- Retorno de tools encapsulado como dado operacional não confiável
- Regra explícita no prompt builder: nunca seguir instruções em conteúdo de tools
- Logs sanitizados (`ToolLogSanitizer`) — sem PII completa, tokens ou payloads brutos
- Testes: injection tentando alterar `companyId`, parâmetro extra rejeitado

---

## 10. Observabilidade

- `AiMetricsAggregatorService` — buckets read/write separados
- `AiMetricsSnapshots` + fila `AiMetricsQueue`
- Cache Redis 5 min; fallback snapshot se Redis indisponível
- `AI_METRICS_V2_ENABLED=false` por padrão — dashboard não quebra com flags OFF

---

## 11. Gemini

- Implementado via endpoint OpenAI-compatible em `OpenAIProvider.ts`
- `isToolCallingSupported` inclui `gemini`
- Sem comportamento fictício — recursos não suportados retornam erro ou delegam ao fallback configurado
- OpenAI permanece intacto

---

## 12. Storage

- `UnifiedMediaPersistenceService` — registro idempotente em `MessageMediaFiles`
- Hook em `saveMediaFile.ts` — inbound/outbound
- Metadados: MIME, tamanho, hash, direction, ticket, contato, empresa
- Backfill: `backfill:legacy-media -- --dry-run` (não sobrescreve mídia válida)

Homolog: 7 registros `MessageMediaFiles` para company 1.

---

## 13. UI

### Painel memória (`ContactAiMemoryPanel`)
- Filtros tipo/status/origem · promoção verificação · nota humana · soft delete · export LGPD · paginação
- Diferenciação visual: inferida, user_stated, system_verified, human_verified, agent_note, human_note

### Timeline (`TicketAiTimeline`)
- Filtros ticket/contato/tool/risco/sucesso · estado anterior/novo · idempotência reutilizada · dados sanitizados

---

## 14. Testes executados

| Suite | Resultado |
|-------|-----------|
| `npm run build` (backend) | PASS |
| `npm run build` (frontend) | PASS |
| Jest `AiServices\|ToolGovernance\|ToolInput` | **84 tests PASS** (12 suites) |
| ESLint AI files | PASS (após fix ToolInputValidator) |
| `npm test` completo | Não executado — pretest requer Postgres local test env indisponível |

Testes adicionados/validados incluem: memória agente, promoção humana, idempotência, prompt injection, flags OFF, isolamento multiempresa.

---

## 15. Resultados de homologação

```bash
npm run db:migrate          # 3 migrations aplicadas (phase3, phase4, consolidation)
COMPANY_ID=1 npm run seed:ai-phase3    # OK — 5 agentes
COMPANY_ID=1 npm run audit:ai-phase3    # 10/10 PASS
COMPANY_ID=1 npm run seed:ai-phase4     # OK
COMPANY_ID=1 npm run audit:ai-phase4    # OK — 9 tools, write OFF, metrics v2 OFF
```

Flags globais confirmadas OFF em runtime. Settings empresa desabilitadas por default.

---

## 16. Flags e Settings

| Flag | Default env | Setting empresa | Default setting |
|------|-------------|-----------------|-----------------|
| `AI_CONTACT_MEMORY_ENABLED` | false | `aiContactMemoryEnabled` | disabled |
| `AI_TOOLS_ENABLED` | false | `aiToolsEnabled` | disabled |
| `AI_WRITE_TOOLS_ENABLED` | false | `aiWriteToolsEnabled` | disabled |
| `AI_METRICS_V2_ENABLED` | false | — | — |

Combinações parciais validadas: write OFF bloqueia execução mesmo com tools ON; dashboard degradado sem metrics v2.

---

## 17. Commits criados

| # | Hash | Mensagem | Escopo |
|---|------|----------|--------|
| 1 | `541d277` | `feat(ai): add governed contact memory and executable read tools` | Fase 3 — memória, read tools, handoff, fila Bull, APIs memória, UI memória, docs F3 |
| 2 | `e80bd69` | `feat(ai): add governed write tools and operational observability` | Fase 4 — write tools, idempotência persistente, metrics, Gemini, storage, timeline, consolidação, docs F4 + relatório |

**Nota:** arquivos de integração compartilhados (`ProcessInboundMessageService`, `aiRoutes.ts`, `queues.ts`, etc.) incluídos no commit 2 por conterem lógica Fase 4; commit 1 contém núcleo Fase 3 autossuficiente.

---

## 18. Arquivos excluídos

Ver seção 2. Working tree limpa após commits, exceto artefatos locais listados.

---

## 19. Pendências reais

1. **`npm test` completo** — requer ambiente Postgres test local (pretest falha sem DB)
2. **Validação funcional end-to-end com flags ON** — requer ativação manual em homolog e fluxo WhatsApp real
3. **`fix:agent-memory --apply`** — não necessário em homolog (0 registros incorretos detectados)

---

## 20. Riscos residuais

| Risco | Mitigação |
|-------|-----------|
| Gemini paridade parcial vs OpenAI | Fallback configurável; erro controlado |
| Rollback write tools manual | Logs auditáveis com previous/new state |
| Concorrência humano + IA no ticket | Governança bloqueia writes com humano ativo |
| Redis indisponível | Idempotência DB permanece; metrics degradam para snapshot |

---

## 21. Confirmação operacional

- [x] Fase 3 commitada localmente
- [x] Fase 4 commitada localmente
- [x] Builds aprovados
- [x] Testes IA aprovados (84)
- [x] Migrations validadas em homolog
- [x] Audits aprovados
- [x] Memória agente não pode ser `human_verified`
- [x] Write tools com idempotência persistente
- [x] Flags OFF por default
- [x] Documentação sincronizada
- [x] **Nenhum push para `main`**
- [x] **Nenhum deploy em produção**
