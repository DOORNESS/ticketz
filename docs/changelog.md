# Changelog — Documentação Ticketz

Histórico de alterações em `MANUAL_PLATAFORMA.md` e estrutura `docs/`.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [1.5.21] — 2026-07-23

### Corrigido

- **Deploy Contabo:** instala `@aws-sdk/s3-request-presigner` na VPS e faz lazy-import — evita crash `MODULE_NOT_FOUND` no boot
- Envia `package.json` / `package-lock.json` no zip de patch

---

## [1.5.20] — 2026-07-23

### Corrigido

- **Deploy Contabo patch:** inclui `storageEnv`, adapters B2, `MediaServices/*` e migration de lifecycle — evita `Cannot find module './storageEnv'` após restart

---

## [1.5.19] — 2026-07-23

### Adicionado

- **Zerar base de clientes:** botão no topo da lista de tickets (somente `user.super`), endpoint `POST /ai/wipe-customer-base` — apaga contatos + tickets da empresa para testes limpos

### Corrigido

- **Tools do agente não salvavam:** `PUT /ai/agents/:id/tools` agora persiste bindings mesmo com `AI_TOOLS_ENABLED` off (flag só bloqueia runtime); UI mostra alerta e aviso ao salvar
- **Bootstrap IA sobrescrevia ACK:** `EnsureAiFirstResponderService` não força mais `ackEnabled: false` em todos os agentes a cada save

### Documentação

- Manual §8 (wipe customer base), §11 (persistência de tools)

---

## [1.5.18] — 2026-07-23

### Corrigido

- **Orquestrador IA:** `ProcessInboundMessageService` sempre executa `resolveSpecialistAgent` (antes ignorado quando o agente vinha da fila inbound)
- **KB vazia / alucinação:** fallback de contexto no modo orquestrador; removido keyword fixo `"fortmax webg3..."` em `KnowledgeContextService`
- **Handoff implícito:** mensagens da IA simulando transferência (`detectImpliedHandoffMessage`) disparam handoff real e movem ticket para **Aguardando**
- **Prompt bootstrap:** `EnsureAiFirstResponderService` preserva `basePrompt` existente do agente
- **403 ao assumir:** `assertCanAcceptTicket` permite assumir tickets em handoff/IA quando o usuário tem `canViewTicket`, sem exigir fila errada
- **Socket lista IA:** `websocketUpdateTicket` emite `operationalState` serializado para atualizar abas em tempo real

### Documentação

- Manual §30 (orquestrador, handoff implícito, assume) — pendente sincronização completa na próxima entrega B2

---

## [1.5.17] — 2026-07-23

### Adicionado

- **Backblaze B2 privado:** URLs assinadas temporárias, endpoints `/media/access/:token` e `/media/:mediaId/signed-url`
- **Lifecycle de mídia:** campos em `MessageMediaFiles`, tabela `MediaDeletionAudits`, retenção 60 dias, cron Bull (`MediaCleanupQueue`)
- **Exclusão permanente de conversa:** fila background, auditoria, bloqueio de novas mensagens
- **Limpeza de órfãos:** job semanal conservador
- Exemplos `.env.example` / `.env-backend.example` (sem credenciais)

### Documentação

- Manual §18 (armazenamento privado B2), §38 (env vars lifecycle)

---

## [1.5.16] — 2026-07-23

### Corrigido

- **IA triagem:** saudação inicial por horário (`Olá, boa tarde! Em que posso ajudar?`) em vez de pergunta genérica de módulo após `Oi`
- **Handoff precoce:** bloqueio de transferência automática até coleta mínima de contexto (2 rodadas + `caseReadyForHandoff`); tool `request_human_handoff` valida completude do caso
- **Aba IA após transferência:** tickets com `aiHandoff` em `pending` passam para **Aguardando** no frontend e backend (`isHandoffPendingTicketState`, `isAiHandlingTicket`)
- **Horário comercial:** handoff humano força modo definitivo (`aiPaused=true`)

### Documentação

- Manual §30 (triagem/handoff/listagem) atualizado

---

## [1.5.15] — 2026-07-23

### Corrigido

- **Repositório multimodal:** uploads exigem Backblaze B2 configurado; sync automático `B2_*` → Settings no boot; script `scripts/apply-b2-vps-env.py` para VPS
- Erro traduzido `ERR_STORAGE_NOT_CONFIGURED` quando B2 ausente

---

## [1.5.14] — 2026-07-23

### Corrigido

- **Salvar agente IA (403):** sync de ferramentas não bloqueia mais o save quando `AI_TOOLS_ENABLED`/`aiToolsEnabled` estão desligados
- **Salvar agente IA (400):** orquestrador não rejeita `specialty` herdada do formulário; update não mescla mais relações Sequelize no payload
- **isAdmin:** super admin via JWT (`req.user.isSuper`) e código `ERR_NO_PERMISSION` traduzível

---

## [1.5.13] — 2026-07-22

### Corrigido

- **Envio WhatsApp:** validação de sessão `CONNECTED` antes de enviar; frontend aguarda API e mantém texto se falhar (§5, §15, §36)
- **Copiloto pós-assunção:** erros explícitos (`ERR_AI_AGENT_NOT_FOUND`, `ERR_COPILOT_SUGGESTION_FAILED`); `shouldRunCopilot` inclui `aiHumanAssumedAt` (§11, §27)
- **403 pós-F5:** JWT expirado retorna 401; interceptor renova sessão também em 403 legado (§15, §36)
- **Lista de tickets:** botões de ação no topo direito do card, clicáveis com badges IA (§5, §36)
- Deploy VPS patch: `middleware/isAuth.js` incluído em `PATCH_PATHS`

---

## [1.5.0] — 2026-07-19

### Adicionado (Repositório multimodal + painel unificado)

- Repositório central de conteúdos (`ContentRepositoryItems`) separado da Base de Conhecimento
- Envio de itens do Repositório dentro da conversa (`GET/POST /tickets/:id/repository`)
- Ferramentas IA `search_repository` e `send_repository_item`
- Painel administrativo unificado na conversa + modal Repositório
- Botão **Sugerir resposta com IA** no campo de mensagem
- Admin **Repositório** em `/ai/repository`
- Associação opcional Repositório → Base de Conhecimento (ingestão via CMS existente)
- Versionamento de itens (`ContentRepositoryItemVersions`)

### Corrigido

- Áudio gravado pelo atendente: `File` com MIME `audio/mpeg`, upload síncrono (sem race)
- Upload de mídia no painel: removido `setTimeout(2000)` e compressão assíncrona quebrada

---

## [1.5.1] — 2026-07-19

### Corrigido

- **Reabrir ticket (400):** novo `POST /tickets/:id/reopen` via `ReopenClosedTicketManuallyService` — fecha ticket conflitante (`justClose`) antes de reabrir; corrige `ERR_OTHER_OPEN_TICKET`
- **Reabrir e chamar IA:** fluxo unificado no mesmo endpoint (`releaseToAi: true`)
- **Topo da conversa compacto:** `ClosedTicketBar` só ícones; `TicketConversationToolbar`; tags colapsadas; diagnóstico IA no drawer
- Build frontend: ícone `Android` (MUI v4), import `CameraAltIcon` em `MessageInputCustom`
- Deploy VPS: `PATCH_PATHS` inclui Repositório + `ReopenClosedTicketManuallyService`

### Adicionado

- Migration v2 esqueleto: categorias, usage logs, permissões granulares
- `ContentRepositoryUsageLog` registrado em envios (humano/IA)
- Testes unitários: `ReopenClosedTicketManuallyService` (3), `ContentRepositoryService` (5), `CheckContactOpenTickets` (1)

### Manual

- §8 reabertura manual + UI compacta; §45 Repositório multimodal; versão manual **1.5**

---

---

---

---

---

## [1.5.12] — 2026-07-20

### Corrigido

- **Admin master não acha conversas IA:** aba IA usa filtro `ai_supervision` (qualquer ticket com IA ativa, inclusive já assumido por humano como Thiago)
- **Filtro de filas:** super/admin ignora filas selecionadas em todas as abas (Atendendo, Aguardando, IA)
- **Backend:** novo filtro `ai_supervision` em `ListTicketsService`

### Manual

- Versão manual **1.5.12**

---

## [1.5.11] — 2026-07-20

### Corrigido

- **Aba IA vazia para admin master:** supervisão (`user.super` / admin) não bypassava filtro de filas no frontend (`ticketListVisibility`) nem no backend (`ListTicketsService`)
- **403 em operações de ticket:** super admin tratado como admin em `UpdateTicketService`, `MessageController` e socket `joinChatBox` via `canViewTicket`
- **Notificações vs aba IA:** super admin entra nos rooms company-wide do socket e nas notificações como admin da empresa
- **Build frontend:** import corrigido de `apiWarmup` em `useAuth`

### Manual

- Versão manual **1.5.11**

---

## [1.5.10] — 2026-07-20

### Corrigido

- **Produção sem tickets:** deploy patch omitia `helpers/canViewTicket.js` — heavy routes falhavam com `Cannot find module '../helpers/canViewTicket'` e `/tickets` retornava 503 permanente
- **PATCH_PATHS:** inclui `canViewTicket`, `isAdmin`, `SessionController`, `contactRoutes`

### Manual

- Versão manual **1.5.10**

---

## [1.5.9] — 2026-07-20

### Corrigido

- **ERR_HEAVY_ROUTES_LOADING:** heavy routes carregam de forma síncrona via `ensureHeavyRoutes()` (sem janela 503 entre login e tickets)
- **Lista vazia/skeleton:** `useTickets` retenta automaticamente em 503 durante warmup
- **Toast assustador:** erros de warmup não aparecem mais como código cru na tela

### Manual

- Versão manual **1.5.9**

---

## [1.5.8] — 2026-07-20

### Corrigido

- **Login 503:** rotas core de auth (`/auth/refresh_token`, `/auth/me`) liberadas antes das heavy routes; frontend reconhece `ERR_HEAVY_ROUTES_LOADING` e retenta refresh
- **Admin master (`user.super`):** vê todos os atendimentos (Atendendo, Aguardando, IA) com supervisão automática e toggle “Todos”
- **Excluir contato:** botão visível para super admin; `DELETE /contacts/:id` exige admin ou super
- **`GET /auth/me`:** validação de cookie antes de decodificar token

### Manual

- Versão manual **1.5.8**

---

## [1.5.7] — 2026-07-19

### Corrigido

- **403 ao abrir ticket Aguardando:** `canViewTicket` unifica permissão de visualização com a lista (observação, fila, handoff, IA)
- **Abas desalinhadas:** `removeFromList` passa a remover ticket da lista; filtro Atendendo rejeita `status !== open`; devolver para IA muda aba para IA
- **Botão X não encerrava na lista:** mesmo fix de `removeFromList` + remoção quando coluna operacional muda
- **OOH repetido com IA ativa:** fora do horário não dispara quando `isAiHandlingTicket`
- **IA repetindo mesma pergunta:** triagem não reenvia investigação idêntica consecutiva
- **Repositório admin:** `GET /ai/repository/:id/preview`, miniaturas na lista, preview/substituição de arquivo no editar
- **Copiloto:** botões do painel avisam quando ticket não está aceito

### Manual

- §45 preview admin; versão manual **1.5.7**

---

## [1.5.6] — 2026-07-19

### Corrigido

- **Mídia quebrada no chat / WhatsApp / repositório:** `servePublicMedia` + `extractCompanyIdFromStorageKey` corrigem download de arquivos em `suporte/{companyId}/...` (§18)
- **Áudio gravado no painel (400):** conversão MP3→OGG sem validação prévia duplicada; MIME normalizado no upload
- **Imagens do repositório:** `image/jpg`→`image/jpeg`; buffer vazio rejeitado no envio; preview com miniaturas e detecção de erro JSON
- **403 genérico:** interceptor axios só renova token em **401** (não em 403 de negócio)
- **Notificações duplicadas:** ticket aberto na aba Atendendo não entra mais no popover
- **Copiloto:** feedback quando ticket não está aceito; erros 403 visíveis
- **Histórico:** `MessagesList` infere tipo de mídia pela URL (áudio não renderiza mais como imagem quebrada)

### Manual

- §18 servir `/public/*`; §45 endpoint preview; versão manual **1.5.6**

---

## [1.5.5] — 2026-07-19

### Corrigido

- Modo observação stale não bloqueia mais atendente dono do ticket (input, repositório, fechar)
- Mensagens fora do horário não disparam após humano assumir (`ticket.userId` + heal `pending→open`)
- Fechar/Reabrir: endpoint `/reopen`, permissões e erros traduzidos (`ERR_TICKET_NOT_ASSIGNED`)
- Assumir da IA usa `aiHandoffMode: operational` (estado consistente pós-handoff)

---

## [1.5.4] — 2026-07-19

### Adicionado

- `TicketOperationalStateService` — payload canônico `operationalState` em tickets (owner, coluna, ações permitidas)
- `assertCanAcceptTicket` — validação unificada de aceite/assumir por fila
- Preview autenticado do Repositório: `GET /tickets/:id/repository/:itemId/preview`

### Corrigido

- Assumir/Aceitar/Devolver/Reabrir: transações atômicas, feedback e sync frontend pós-ação
- Listas IA/Aguardando/Atendendo alinhadas backend↔frontend (handoff operacional, F5, socket)
- Repositório: acesso unificado list/send, erros 400 explicados (`ERR_REPOSITORY_MEDIA_MISSING`)
- IA vs mensagens automáticas: bypass legado quando IA ativa; `releaseToAi` volta para `pending`

---

### Corrigido

- IA outbound: `sanitizeAiOutboundText` remove ofertas proativas de atendimento humano; regras de prompt/horário reforçadas
- Supervisão: `MessagesList` carrega histórico completo em modo observação + botão "Carregar mensagens anteriores"
- Lista aba **IA**: ticket some ao ser assumido por humano (socket `TicketsListCustom`)
- Copiloto: estados loading/empty separados, erro 422 visível, fallback de agente por `aiAgentId`
- Badge `isAiHandlingTicket` alinhado ao backend (`aiHandoffMode === operational`)

### Corrigido (hotfix deploy)

- `deploy-vps-backend.py`: inclui `sanitizeAiOutboundText.js` e glob `services/AiServices/*.js` no patch (503 por módulo ausente)

---

## [1.5.2] — 2026-07-19

### Adicionado

- Permissões granulares integradas em endpoints/controllers do Repositório
- CRUD categorias + filtros `categoryId`
- Favoritos, Recentes, Mais usados (`RepositoryPanel` + API ticket-scoped)
- Histórico/restauração de versões + status KB (reprocess/unlink)
- Copiloto: estilos curta/técnica/cordial/objetiva + contexto Repositório
- Painel admin unificado com ações de atendimento no drawer
- Script `validate-content-repository-migrations.js`
- Testes ampliados (15 casos ContentRepository + reopen)

### Corrigido

- Deploy VPS: paths `tools/definitions/` + migrations no patch list
- Rotas ticket-scoped para favoritar/categorias (agentes sem isAdmin)

---

### Corrigido (CI deploy produção)

- `deploy-prod.yml`: `git rev-parse --short=7 HEAD` alinhado na geração e verificação de `gitinfo.json` (evita mismatch quando Git usa hash curto de 8 caracteres)

---

## [1.4.3] — 2026-07-19

### Adicionado (Triagem IA v2 + áudio/copiloto)

- Módulo `backend/src/services/AiServices/Triage/` (completude do caso, política de handoff, timeline, read receipt, transcrição condicional)
- Migration `20260719100000-ai-triage-v2-professional-flow.ts`
- Handoff operacional vs definitivo; preservação de `aiHandoffOriginalReason`
- Correção áudio outbound do painel (validação ffmpeg + Opus/PTT)
- Copiloto on-demand via `POST /tickets/:id/ai/copilot`
- Manual §30 (triagem v2), §31 (copiloto ampliado)
- Deploy VPS Contabo: **sempre 1 ZIP** (`deploy-vps-backend.py` → `Expand-Archive`); proibido upload arquivo a arquivo via WinRM
- Read receipt WhatsApp adiado quando triagem v2 + IA ativa (`shouldDeferWhatsAppReadReceipt`)
- Fix CORS produção: `appFast.ts` carrega `bootstrap` antes do middleware cors (`.env` / `FRONTEND_URL`)
- WhatsApp: `WHATSAPP_AUTO_START=true`, watchdog reconecta sessões com BaileysKeys, deploy não apaga credenciais
- WhatsApp conflito 440: reconexão suave sem `DeleteBaileysService`; cancelamento de restarts duplicados em `wbot.ts`
- WhatsApp QR: removido limite de 3 rotações que apagava credenciais; estado `PAIRING` protege scan; deploy WinRM usa part files isolados
- WhatsApp pairing: proteção `PAIRING` não deixa mais socket morto (reinicia sessão em QR expirado/conflito/desconexão transitória); `QrcodeModal` força QR novo ao abrir e faz poll a cada 4s
- Triagem v2 UX: confirmação antes de handoff (`explicar` / `atendente`); resposta a “quem está falando?”; Aceitar handoff via `/ai/assume` (sem 403); tickets handoff na aba Aguardando; reabrir resolvidos para qualquer agente; banner IA some após assumir; áudio outbound (typo `disableOption`)
- Tickets fechados: barra Reabrir / Reabrir e chamar IA; botão na lista Resolvidos; 403 corrigido (reopen sem dono, agente atribuído abre ticket fora da fila)
- Reabertura automática: nova mensagem do cliente reabre ticket antes de persistir mensagem; classifica IA vs Aguardando; CheckContactOpenTickets exclui ticket atual; notificações não apagam ticket reaberto
- Suporte Thiago: timeline IA sem 403, fechar ticket com `justClose`, botão Devolver para IA, Chamar IA ativo
- Deploy VPS: `DEPLOY_MODE=patch` + zip único (`deploy-cache/`), chunks WinRM 2000, health poll (sem sleep 60s)
- Read receipt WhatsApp adiado quando triagem v2 + IA ativa (`shouldDeferWhatsAppReadReceipt`)

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
