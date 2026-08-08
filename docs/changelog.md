# Changelog — Documentação Ticketz

Histórico de alterações em `MANUAL_PLATAFORMA.md` e estrutura `docs/`.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [1.7.1] — 2026-08-08

### Validado contra Postgres real

- Migration `20260820100000-multibrand-foundation` aplicada em cluster descartável (PG 17 + pgvector): **UP → DOWN → UP** limpos, tabelas e colunas criadas e removidas corretamente.
- Backfill executado: 2 Brands criadas, vínculos de conexão/fila/agente/domínio/base corretos, tickets herdando a marca da conexão de origem. Idempotente na segunda execução.
- **Bug pré-existente encontrado:** `db:migrate` do zero falha em `20260719180000-content-repository`, que referencia `KnowledgeDomains` — tabela criada só por `20260725100000-ai-phase2-knowledge-cms`, de timestamp posterior. Não afeta ambientes existentes (as tabelas já existem), mas quebra instalação nova. Não corrigido aqui.

### Corrigido

- **Contagem do backfill:** `Model.update` devolve `[affectedCount]`; ler o índice 1 fazia o relatório dizer 0 tickets mesmo com o UPDATE aplicado. É esse número que autoriza concluir a migração.

### Adicionado

- **Administração → Marcas** (`pages/Brands` + `BrandModal`): criar, editar, ativar/desativar; nome, slug, nome curto, logo, cor, persona, vocabulário, URL de escalação, fallback e contatos.
- **Funcionário × Marcas** (`UserBrandsSelect` no `UserModal`): seleção múltipla com o mesmo login e switch **Pode atender / Só supervisiona**.
- **`canAttend` no backend:** `assertCanAcceptTicket` barra assumir ticket de marca marcada como somente-supervisão.
- **`BrandPersonaService`:** persona, fallback, contatos, URLs e regras operacionais derivados dos DADOS da Brand. `AgentPersonaService` ganhou camada `*ForBrand` que prefere o registro e mantém o caminho antigo como fallback.
- **Setting `brandIsolationEnforced`** (padrão `disabled`): fecha a exceção de transição. Ligado, usuário comum sem vínculo perde o acesso em vez de ganhar acesso total. Troca por configuração, reversível na mesma velocidade.

### Alterado — hardcodes removidos

- `CaseCompletenessEngine`: `/nível/`, `/cashback/` e `/fidelização/` saíram do classificador de intenção; o vocabulário entra por `brandVocabulary`, vindo do registro da Brand. `shouldSkipSupportInvestigation` e `buildInvestigationQuestion` também recebem o vocabulário.
- `KnowledgeContextService`: removido o bônus fixo de +3 no ranking para "cashback"/"nível" — uma marca era favorecida sobre todas as outras. O reforço agora vem do vocabulário da marca do atendimento.

## [1.7.0] — 2026-08-08

### Adicionado — arquitetura multimarca

- **`Brand`**: marca/linha de atendimento dentro da Company. Entidade própria (não evolução de `KnowledgeDomain`, que segue como taxonomia do CMS — relação Brand 1—N KnowledgeDomain). Centraliza persona, contatos, URLs, fallback, vocabulário e tema, que antes estavam compilados no código (§3).
- **`Tickets.brandId`**: identidade histórica do atendimento, gravada no nascimento por `FindOrCreateTicketService` e nunca rederivada. Origem define a empresa; conteúdo da mensagem, apenas a intenção.
- **FKs de marca** em `Whatsapps`, `Queues`, `AiAgents`, `KnowledgeDomains`, `KnowledgeBases` — todas `allowNull`, para o fluxo legado continuar operando antes do backfill.
- **`UserBrand`**: permissão N:N por funcionário, com `canAttend` separando supervisionar de atender. Sem vínculo = sem restrição (usuário legado), para o deploy não derrubar atendentes existentes.
- **Autorização no backend**: `BrandAccessService` + gate em `canViewTicket`, ponto único já usado por socket, controller de ticket, mídia e aceite. `resolveBrandFilterForQuery` cruza o filtro pedido pela UI com a permissão, então querystring não amplia alcance.
- **Isolamento de conhecimento**: `restrictKnowledgeBasesToBrand` remove do contexto RAG qualquer base de outra marca, nos dois caminhos de resposta. Base sem marca (legado) é preservada.
- **Agente por marca**: `getActiveAgentForTicket` resolve pelo `brandId` do ticket; resolução por fila permanece como fallback.
- **API**: `GET /brands` (seletor, já filtrado por permissão), CRUD admin, `GET|PUT /users/:userId/brands`, `POST /brands/backfill`.
- **Frontend**: `BrandBadge` (logo + rótulo textual, não só cor) na lista e no cabeçalho; `TicketsBrandFilter` global com "Todas" = todas as permitidas; filtro persistido por usuário em `localStorage`.
- **Backfill idempotente** (`BackfillBrandsService`): cria Nível e Fortmax a partir dos vínculos existentes. Único lugar onde o casamento por nome é usado de propósito — para gravá-lo em FK uma vez.
- **Migration** `20260820100000-multibrand-foundation`.

### Alterado

- `BrandResolutionService` substitui `name.includes("nivel")` por FK. O fallback legado por nome permanece durante a transição, instrumentado com `legacyBrandFallback` no log — é a evidência que autoriza removê-lo.

## [1.6.1] — 2026-08-07

### Corrigido

- **Aba IA esvaziava sozinha (~3s):** `TicketsListCustom` apagava da lista todo ticket cujo `operationalState.listColumn !== "ai"`. Em supervisão a aba acompanha também handoff pendente e IA pausada, que o backend marca como `pending`/`open` — o primeiro evento de socket limpava a lista. A decisão passou a ser exclusivamente de `shouldShowTicketInList`. Contrato travado em `ticketListVisibility.aiTab.spec.js` (§8).
- **Turno atual duplicado no prompt:** a mensagem do cliente é persistida por `verifyMessage` antes da IA rodar, então voltava em `Message.findAll` e ainda era anexada ao fim do array — o modelo via o mesmo turno duas vezes. `dropDuplicatedCurrentTurn` remove a repetição nos dois caminhos de resposta (§27).

### Adicionado

- **`ConversationAttemptStateService`** — deriva do histórico o que o cliente já tentou e falhou (relato de tentativa, resultado ausente ou pré-requisito perdido) e os links já oferecidos, injetando um bloco explícito no prompt que proíbe repetir a etapa descartada e manda avançar para a seguinte. Agnóstico de marca e procedimento (§27).
- **Regras operacionais anti-repetição** em `DEFAULT_OPERATIONAL_RULES`: identificar a etapa em que o cliente já está, nunca reenviar passo que ele disse ter tentado, escolher a alternativa compatível com o relato e dar o passo mais resolutivo antes de pedir print/CPF.
- **Avaliação de qualidade de atendimento:** `NivelConversationQuality.spec.ts` (determinístico, exercita retrieval com corpus controlado e registra query → fontes → restrições → resposta) e `npm run eval:ai-replies` (provedor real, fora do CI).

---

## [1.6.0] — 2026-08-06

### Corrigido (ciclo de reconexão WhatsApp — causa raiz de instabilidade crônica)

- **Causa raiz** — `libs/wbot.ts` configurava `keepAliveIntervalMs: 5 * 60 * 1000`. O padrão da biblioteca é **30s**. O WhatsApp derruba WebSocket ocioso em ~1 min, então o servidor fechava a conexão muito antes do primeiro ping do cliente. O `ws.on('close')` do Baileys vira `Boom('Connection Terminated', { statusCode: 428 })`.
- **Escala do problema** — no log arquivado: **19.383** eventos "QR expired", 19.413 "Connection Terminated", 26.145 closes. **Todos** os disconnects eram 428; zero ocorrências de 401, 403, 408, 440 ou 515.
- **Erro de tratamento** — o handler classificava `428` como "QR expirado" e derrubava o socket, marcava `OPENING`, limpava `qrcode` e reiniciava com espera fixa de 12s e `retries: 0`. `428` é `DisconnectReason.connectionClosed` — não diz nada sobre a validade da credencial.
- **Correção** — `keepAliveIntervalMs` volta a 30s (`WA_KEEPALIVE_INTERVAL_MS` ajusta). Nova `SessionReconnectPolicy` classifica a desconexão: só `401`, `403` e `500` limpam credenciais e pedem novo QR; `408`, `428`, `440` e `515` reconectam reaproveitando as credenciais; status desconhecido erra para o lado seguro e nunca apaga credencial. Backoff progressivo 5s→10s→20s→40s→60s, zerado quando a conexão abre. Conflito (`440`) usa backoff próprio 15s→120s. Um único restart agendado por conexão, com isolamento entre Nível e WebG3.
- **Cobertura** — `SessionReconnectPolicy.spec.ts`, 16 casos: 428 transitório, 401/403 logout real, 500 credencial corrompida, conflito, abre-e-fecha, sequência de fechamentos, timer duplicado, isolamento entre conexões.

---

## [1.5.99] — 2026-08-04

### Adicionado (pergunta de confirmação adiada — fluxo de recuperação de conta)

- **Problema** — a IA mandava o cliente abrir o link de recuperação e, na mesma mensagem, perguntava "Conseguiu localizar sua conta?". O cliente ainda não tinha tido chance de tentar, então a pergunta chegava vazia e a conversa travava.
- **Comportamento** — `deliverAiReply` recorta a confirmação final, entrega só as instruções e agenda a pergunta para ~60s depois (`AI_DEFERRED_QUESTION_SECONDS`). Um cron de 15s entrega, e **descarta** se qualquer mensagem tiver entrado no ticket nesse meio tempo.
- **Escopo deliberado** — só o contexto de recuperação de conta/senha, e só perguntas de confirmação de resultado. Pedido de dado ("Qual é o CPF cadastrado?") nunca é adiado: é ele que destrava o atendimento.
- **Arquitetura** — regra pura isolada em `AiDeferredQuestionRules` (sem model/Redis/fila), para ser testável e rápida; o serviço cuida de Redis e entrega.
- **Cobertura** — `AiDeferredQuestion.spec.ts`, incluindo o caso real de produção. Suíte `AiServices` em 245 testes verdes.

---

## [1.5.98] — 2026-08-04

### Corrigido (edição do prompt do agente era revertida a cada reinício)

- **Causa** — `WireSupportLinesService` roda a cada boot (via `bootstrapAiPlatform`) e gravava `basePrompt: NIVEL_PROMPT` incondicionalmente. Qualquer alteração feita pelo admin no painel voltava para a semente no restart seguinte. A linha Fortmax já preservava o prompt existente; só a linha Nível sobrescrevia.
- **Correção** — `resolveSeededBasePrompt` passa a valer para as duas marcas: o prompt do painel é a fonte de verdade e só é resemeado quando está vazio ou pertence à outra marca (contaminação Nível ↔ Fortmax, que é o caso que o religamento existe para reparar).

### Alterado (saudação de abertura)

- **Antes** — `"Me chamo Nivelton, assistente da Nível Cashback. Olá, bom dia! Como posso ajudar você hoje?"`, montado em `buildAgentGreetingReply` e portanto **impossível de mudar pelo prompt**.
- **Agora** — `"Olá, Fernando, boa tarde! Em que posso ajudar?"`, ou `"Olá, boa tarde! Em que posso ajudar?"` quando o contato não tem pushName utilizável. Saudação seguinte no mesmo ticket: apenas `"Em que posso ajudar?"`.
- **Nome do cliente** — `resolveCustomerFirstName` usa o primeiro nome do pushName do WhatsApp, descarta nome que é o próprio telefone, remove emoji e normaliza caixa alta.
- **Identidade do agente** — continua respondida por `buildAgentIdentityReply` quando o cliente pergunta o nome; deixou apenas de abrir toda conversa.
- **Cobertura** — `AgentGreeting.spec.ts` (13 casos) + specs de saudação atualizados em `AgentBrandIsolation` e `WhatsAppAiTurnService`.

---

## [1.5.97] — 2026-08-03

### Corrigido (conexão WhatsApp presa em DISCONNECTED)

- **Causa confirmada em produção** — a conexão “Nivel” (`whatsappId 3`) ficou `DISCONNECTED` desde 03/08 16:41 BRT com `Whatsapps.updatedAt` congelado e **zero mensagens inbound desde 02/08 16:20**. A IA não respondeu porque a mensagem nunca chegou ao backend; a cadeia de IA estava íntegra (agentes ativos, filas ligadas, `openAiKey` presente).
- **`StartWhatsAppSession`** — a guarda `openingSessions` era liberada no `finally` de `initWASocket`, promise que o Baileys pode deixar pendente para sempre. Com a guarda presa, `isWhatsAppSessionStarting()` retornava `true` indefinidamente e as três vias de recuperação (watchdog `*/5 * * * *`, `scheduleSessionRestart` e o botão *reconectar* do painel) pulavam a conexão. Só um reinício do processo resolvia.
- **Correção** — a liberação passa a ser feita pelo start limitado por `withTimeout` (`WHATSAPP_START_TIMEOUT_MS`), tanto em sucesso quanto em falha, garantindo que a guarda sempre expire e o watchdog volte a recuperar a sessão.
- **Cobertura** — `StartWhatsAppSessionGuard.spec.ts` cobre `initWASocket` que nunca resolve, start que rejeita, reentrada após timeout e reuso legítimo da promise em curso (3 dos 4 testes falham no código anterior).
- **Manual 1.5.97** — §7 ganha a subseção “Guarda de abertura de sessão”; índice `backend.md` sincronizado.

### Corrigido (novo pareamento deixava credenciais híbridas)

- **`WhatsAppSessionController.update`** — o botão “Novo QR” zerava `Whatsapps.session` (as creds) mas mantinha todas as `BaileysKeys` do registro anterior, e não descartava o socket em memória. O `authState()` passava a combinar creds novas com as chaves de sinal da identidade antiga.
- **Correção** — o início de um novo pareamento passa a chamar `removeWbot` e apagar as `BaileysKeys` da conexão, igualando o comportamento já existente em `reset`, no `disconnect` e no caminho de importação de dump que falha.
- **Escopo** — higiene de credenciais. O travamento em “Waiting for QR Code” observado em produção foi causado pela guarda `openingSessions` presa (item acima), não por estas chaves: com a guarda solta, o QR voltou a ser gerado normalmente mesmo com 1032 chaves órfãs ainda na base.

---

## [1.5.96] — 2026-07-31

### Corrigido (envio de itens do Repositório)

- **Causa confirmada em produção** — o item do ticket 92 foi enviado enquanto a sessão WhatsApp “Nível” estava reconectando (`ERR_WAPP_NOT_INITIALIZED`); não era defeito no arquivo selecionado.
- **Retentativa de conexão** — texto e mídia do Repositório aguardam a recuperação da sessão e repetem o envio até quatro vezes, sem registrar uso antes da entrega.
- **Arquivo temporário** — mídia local passa a ser carregada integralmente antes do envio, eliminando o `ENOENT` provocado pela remoção de um arquivo cujo stream ainda não havia sido aberto.
- **Cobertura** — testes confirmam envio de imagem, PDF, documento e arquivo genérico, remoção segura do temporário e recuperação após falha transitória.
- **Manual 1.5.96** — §45 e índice `backend.md` sincronizados.

---

## [1.5.95] — 2026-07-30

### Corrigido (formulário público de escalação)

- **Causa confirmada em produção** — o Chrome enviava `Origin: https://api.fortmax.com.br`, rejeitado pelo CORS antes de `EscalationEmailController`; por isso o navegador recebia JSON 500 e o formulário nunca acionava a IA.
- **`corsOrigin`** — passa a aceitar `BACKEND_URL`, normaliza barras finais e inclui as origens locais/produção do próprio backend.
- **Cobertura** — teste garante origem própria permitida e origem externa desconhecida rejeitada.
- **Manual 1.5.95** — §11 e índice `api.md` sincronizados.

---

## [1.5.94] — 2026-07-30

### Corrigido (envio rápido de mensagens)

- **`MessageInputCustom`** — envio de texto deixa de bloquear o campo enquanto aguarda WhatsApp/API; o texto é limpo e o foco volta imediatamente para permitir mensagens consecutivas por Enter.
- **Mensagem otimista** — aparece instantaneamente na conversa com estado de envio e é reconciliada com a mensagem confirmada pelo servidor.
- **Falha assíncrona** — remove somente a mensagem temporária, preserva qualquer novo texto digitado e exibe o erro sem travar a composição.
- **`TicketsContext` / `MessagesList`** — adicionados handlers para substituir e remover mensagens temporárias sem duplicação após socket/resposta HTTP.
- **Manual 1.5.94** — §5 e índice `frontend.md` sincronizados.

---

## [1.5.93] — 2026-07-30

### Corrigido (cabeçalho, lightbox e recuperação de conta)

- **`TicketInfo`** — título da conversa passa a exibir telefone primeiro: **telefone · nome · Ticket #ID**.
- **`MediaGalleryLightbox`** — preserva exatamente a URL `blob:` autenticada; antes o cache-buster era anexado ao object URL e tornava a imagem inválida.
- **`AccountRecoverySuccessReplyService`** — confirmação visual de recuperação enviada gera resposta determinística para aguardar a nova senha no e-mail, verificar spam e não abrir chamado duplicado.
- **`wbotMessageListener`** — envelopes `secretEncryptedMessage` de edição deixam de ser enviados à IA como texto “unsupported message”, eliminando a segunda resposta incorreta.
- **`EscalationResolutionService`** — formulário consegue avisar o cliente com fallback seguro mesmo sem modelo, feature de IA ou agente disponível; falha de bookkeeping após a entrega não retorna falso erro ao formulário.
- **Manual 1.5.93** — §5, §11 e índice `ai.md` sincronizados.

---

## [1.5.92] — 2026-07-30

### Corrigido (cache de mídia e formulário)

- **Chat e lightbox** — imagem completa passa a usar URL com `cb=<updatedAt>`, contornando respostas 404/500 antigas armazenadas pelo navegador; o download já utilizava esse padrão.
- **`servePublicMedia`** — respostas do proxy `/public/*` recebem `Cache-Control: no-store`, `Pragma: no-cache` e `Expires: 0`.
- **Formulário de escalação** — `GET/POST /escalation/:token` recebem os mesmos cabeçalhos anti-cache. O link exato do Resend foi validado em produção com HTTP 200.
- **Diagnóstico de produção** — storage B2, URLs geradas para o operador e três imagens do ticket 88 validados com HTTP 200 e conteúdo JPEG completo.
- **Manual 1.5.92** — §11 sincronizada.

---

## [1.5.91] — 2026-07-30

### Corrigido (lightbox e imagens no e-mail)

- **Frontend `MessagesList`** — após evento Socket.io de imagem/vídeo, busca a versão autorizada da mensagem na API; o lightbox deixa de usar a URL privada bruta emitida pelo socket.
- **`MediaGalleryLightbox`** — usa `jpegThumbnail` do WhatsApp nas miniaturas enquanto a mídia completa é carregada.
- **`EscalationTranscriptService` / Resend** — substitui `data:` URLs, removidas pelo Gmail, por anexos inline CID (`content_id`) referenciados no HTML.
- **Formulário público** — mantido com carregamento leve e página HTML; o formulário funcional do print corresponde ao backend atual.
- **Manual 1.5.91** — §11 e índice `ai.md` sincronizados.

---

## [1.5.90] — 2026-07-30

### Corrigido (escalação + mídia B2)

- **`MediaAccessController.accessByToken`** — streama mídia pelo backend em vez de redirect 302 para URL assinada do B2 (corrige imagem que aparecia e quebrava no chat).
- **`EscalationTranscriptService`** — imagens do e-mail de conserto embutidas em base64 (`data:`), sem link externo ao B2.
- **`EscalationResolutionService`** — formulário público carrega ticket leve (sem `ShowTicketService`/socket heal); erros retornam página HTML amigável em vez de JSON 500.
- **Frontend `MessagesList`** — fallback para `jpegThumbnail` quando `mediaUrl` falha ao carregar.
- **Manual 1.5.90** — §11 (escalação + mídia privada).

---

## [1.5.89] — 2026-07-30

### Adicionado (e-mail de conserto técnico)

- **`EscalationEmailService`** — envia e-mail HTML via Resend com histórico completo da conversa, imagens e análises visuais (`visionSummary`).
- **`EscalationResolutionService`** — formulário público assinado (`GET/POST /escalation/:token`) recebe orientação interna do humano e aciona a IA para avisar o cliente no WhatsApp pedindo teste.
- **`AiEscalationEmails`** — migration `20260730120000-ai-escalation-emails.ts`.
- **Frontend** — botão **Solicitar conserto** ao lado de **Participar** (`TicketConversationToolbar`).
- **API** — `POST /tickets/:ticketId/ai/escalate-email`.
- **Manual 1.5.89** — §11, §38 e índice `ai.md` sincronizados.

---

## [1.5.88] — 2026-07-30

### Corrigido (visão descartada no turno IA)

- **`resolveCustomerTurnText`** — preserva blocos `[Imagem enviada pelo cliente]` ao escolher a legenda principal; antes a descrição visual era removida e o modelo respondia “não consigo ver imagens”.
- **`MediaInboundResolver`** — aguarda `visionSummary` persistido no ingest antes de desistir da análise.
- **`ProcessInboundMessageService`** — caminho rápido informativo não roda em mensagens com imagem sem contexto visual.
- **`prepareCustomerFacingAiText`** — remove negações de visão também quando o cliente pergunta “consegue ver a imagem?”.
- **Manual 1.5.88** — §11 e índice `ai.md` sincronizados.

---

## [1.5.87] — 2026-07-30

### Corrigido (visão de imagens no WhatsApp)

- **Análise no ingest** — imagens inbound disparam `analyzeAndPersistInboundImageVision` em `verifyMediaMessage`, persistindo `visionSummary` antes do turno IA.
- **Buffer confiável** — visão usa data URL base64 sempre que o buffer local existe (B2 privado ou não); fallback por `MessageMediaFile.storageKey` quando a leitura direta falha.
- **Turno IA** — bloco `[Imagem enviada pelo cliente]` entra mesmo com legenda; falhas de análise não deixam só o texto da legenda.
- **Resposta** — prompt proíbe “não consigo ver imagens”; `prepareCustomerFacingAiText` remove negação falsa quando há contexto visual.
- **Manual 1.5.87** — §11 e índice `ai.md` sincronizados.

---

## [1.5.86] — 2026-07-30

### Corrigido (respostas duplicadas no WhatsApp)

- **Coalescência inbound** — após adquirir o lock da fila IA, o backend aguarda estabilização do buffer antes de drenar, agrupando mensagens rápidas como `oi` + `poderia me ajudar?` em um único turno.
- **Saudações repetidas** — respostas sociais equivalentes (`como posso ajudar`, `me diga como posso te ajudar`) são suprimidas quando já houve ack recente; o guard evita fallback obrigatório silencioso indevido.
- **Manual 1.5.86** — §11 e índice `ai.md` sincronizados.

---

## [1.5.85] — 2026-07-30

### Corrigido (follow-up subagentes)

- **Saudação legada de fila** — com IA ativa, `startQueue` deixa de enviar `Queue.greetingMessage` (ex.: “Você foi direcionado…”), alinhado ao bypass já usado fora do expediente.
- **Visão com B2 privado** — `resolveVisionImageSource` envia buffer local como data URL base64 quando `B2_USE_PRIVATE_ACCESS=true`, evitando 403 em `/public/...`.
- **Links duplicados no WhatsApp** — respostas IA usam `linkPreview: false` em `sendAiWhatsAppReply`.
- **Manual 1.5.85** — §8–§11 e índice `ai.md` sincronizados.

---

## [1.5.84] — 2026-07-30

### Corrigido (atendimento natural e conhecimento contextual)

- **Multifila sem menu** — removido `AiQueueConciergeService`; conexões Nível e Fortmax entram silenciosamente em uma fila com agente IA, sem pedir números nem repetir apresentação.
- **Cobertura de conhecimento** — a fila técnica não restringe o RAG: vínculos do agente e bases irmãs do domínio continuam disponíveis; perguntas curtas como “qual é o site?” recuperam usando até três perguntas recentes do cliente.
- **Respostas naturais** — prompt evita listas e encerramentos repetitivos, não oferece procedimento inexistente e URLs em Markdown/duplicadas são reduzidas a uma URL simples.
- **Saída concreta por marca** — Nível usa `nivelvelo.com/chamado` quando não há procedimento seguro (preservando recuperação de conta); Fortmax usa Thiago para suporte e Cristiane para gerência/financeiro, sem inventar portal.
- **Horário** — ao assumir automaticamente o ticket multifila, a IA responde antes do aviso legado isolado de fora do expediente.
- **Visão** — imagens recebidas no WhatsApp são analisadas pelo modelo visual; fatos e hipóteses ficam separados e dados sensíveis são mascarados antes de compor a consulta RAG.
- **Manual 1.5.84** — seções §6, §8–§11, §22, §28, §37 e §43, além do índice `ai.md`, sincronizadas.

---

## [1.5.83] — 2026-07-29

### Corrigido (ciclo de vida de respostas supervisionadas)

- **Criação sob demanda** — o wiring deixa de criar `Respostas anexas — Nível` e `Respostas anexas — Fortmax`; cada base nasce somente no primeiro **Anexar à base** confirmado para a marca.
- **Preservação integral** — o wiring não altera nem exclui bases existentes, mesmo quando vazias; somente a confirmação de **Anexar à base** pode criar a base correspondente, caso ainda não exista.
- **Vínculo Fortmax** — a associação automática usa a identidade de marca da persona, reconhecendo também agentes como `Atendente Fortmax`, em vez de uma lista restrita de nomes.
- **Manual 1.5.83** — seções §8–§9 e índice `ai.md` sincronizados.

---

## [1.5.82] — 2026-07-29

### Corrigido (configuração real Nível multifila)

- **Wiring Nível** — preserva as filas Consumidor, Empresa e Recuperação, liga todas exclusivamente ao Nivelton e mapeia cada fila para a base correspondente; vínculos cruzados com o agente Fortmax são removidos.
- **Concierge multi-marca** — seleciona a persona pela marca das filas permitidas, inclui vocabulário de consumidor/empresa/recuperação e nunca apresenta Webin na conexão Nível.
- **Auditoria operacional** — valida todas as filas de ambas as marcas e contabiliza fontes CMS publicadas, além de documentos legados.
- **Protocolo Nível** — recuperação usa links oficiais da base; pedido geral de suporte externo usa `nivelvelo.com/chamado`, sem telefone ou promessa de transferência interna.
- **Backfill CMS** — chunks legados preservam o domínio real da base durante a migração.
- **Ingestão/RAG** — claim atômico impede jobs concorrentes de duplicarem chunks; recuperação elimina conteúdo idêntico da mesma versão antes de montar o contexto.
- **Manual 1.5.82** — seções §8–§9 e índices `ai.md`/`database.md` sincronizados.

---

## [1.5.81] — 2026-07-29

### Corrigido (isolamento de marcas + precisão RAG)

- **`AgentPersonaService`** — identidade, saudação, fallback, regras operacionais e contato são derivados do agente ativo; texto do cliente não altera a marca.
- **Nível × Fortmax** — removidos fallbacks e hints globais da Nível nos caminhos WhatsApp, inbound e Copilot; testes cruzados impedem Nivelton em respostas Webin.
- **Respostas anexas** — gravação e vínculos separados em `respostas-anexas-nivel` e `respostas-anexas-fortmax`; base compartilhada antiga deixa de ser autorizada aos agentes das marcas.
- **RAG seguro** — threshold mínimo aplicado ao prompt; removido fallback dos primeiros 24 chunks; conteúdo indexado e enviado usa o mesmo limite de 1800 caracteres.
- **RAG `structured-v2`** — chunking por páginas/títulos/parágrafos, metadata de página/capítulo/seção, 24 candidatos, reranking híbrido e recuperação de vizinhos da mesma fonte publicada.
- **Compatibilidade** — chunks existentes continuam válidos; documentos substituídos/reindexados recebem o pipeline novo.
- **Manual 1.5.81** — seções §8, §22, §28, §29, §33, §41–§44 e índices temáticos atualizados.

---

## [1.5.80] — 2026-07-29

### Adicionado (concierge IA para WhatsApp Fortmax multifila)

- **`AiQueueConciergeService`** — Webin apresenta somente os departamentos ligados à conexão e aceita escolha por número, palavras-chave ou classificação LLM restrita ao catálogo permitido.
- **Roteamento multifila** — `resolveQueueIdForTicket` não escolhe mais silenciosamente a primeira fila com agente; a mensagem natural que seleciona uma fila IA é reaproveitada no reengajamento.
- **Wiring Fortmax** — preserva Financeiro/Gerência/Suporte configurados no WebG3; bootstrap genérico não liga Webin automaticamente a filas identificadas como Fortmax/WebG3/Nível.
- **Vínculos de agente** — trocar ou selecionar “Nenhuma” remove associações antigas de `AiAgentQueues`.
- **Auditoria operacional** — scripts inicializam o Sequelize; auditoria aceita múltiplos departamentos Fortmax e exige a fila principal de suporte.
- **Manual 1.5.80** — seções §6, §8, §9, §22, §37 e §43 atualizadas; novo diagrama do concierge multifila.

---

## [1.5.79] — 2026-07-28

### Corrigido (2º turno IA travando — timeout + dedupe WhatsApp)

- **`InformationalDirectReplyService`** — timeout em busca na base (8s) e LLM (18s); sem reingest síncrono no caminho rápido WhatsApp.
- **`WhatsAppAiTurnService`** — timeout total de 25s no turno informativo com fallback imediato da Nível.
- **`sendAiWhatsAppReply`** — dedupe só quando não há mensagem nova do cliente após a última resposta (evita silêncio no 2º turno).
- **`CaseCompletenessEngine`** — *"Oi, podes me ajudar?"* reconhecido como pedido curto de ajuda (caminho direto, sem LLM pesado).
- **`withAiTimeout`** — utilitário compartilhado para operações IA com limite de tempo.

---

## [1.5.78] — 2026-07-28

### Corrigido (silêncio IA + copiloto supervisão)

- **`sendAiWhatsAppReply`** — erros WhatsApp propagados; duplicata recente tratada como entrega ok.
- **`WhatsAppAiTurnService`** — só marca turno enviado após WhatsApp confirmar; `finalizeAiResponse` sempre no `finally`.
- **`sendAiCustomerFallback`** — libera `aiProcessingState` mesmo se WhatsApp falhar (evita ticket preso em `processing`).
- **`AiCopilotService`** — fallback local da marca quando LLM falha; supervisão com ticket IA sem `userId`.
- **Fila IA** — lock stale liberado em 12–25s (antes 20–45s).
- **Frontend** — “Sugerir resposta” funciona em modo observação (supervisão).

---

## [1.5.77] — 2026-07-28

### Refatorado (WhatsApp IA — padrão refeito)

- **`WhatsAppAiTurnService`** — fluxo linear: saudação rápida OU resposta informativa direta (LLM + base), sempre com fallback.
- **`findUnansweredCustomerQuestion`** — se o cliente mandou pergunta sem resposta, *"Oi"* / *"Cadê vc"* reprocessam a pergunta real (não repetem Nivelton).
- **`resolveCustomerTurnText`** — unifica batch, nudge e pergunta pendente num único texto.
- **Guarda obrigatória** — `skipDedupe` no fallback final (fim do silêncio por dedupe Redis).
- **Fila** — erro transitório não ignora mais saudações; buffer reagendado se ticket ficar inelegível momentaneamente.
- **Debounce 1200ms** — agrupa *Oi* + pergunta sem atraso perceptível.

## [1.5.76] — 2026-07-27

### Corrigido (lentidão, silêncio e saudação repetida — Nivelton)

- **Saudação instantânea** — *"Oi"* responde em template local (<1s), sem chamar LLM.
- **Anti-repetição** — segundo *"Oi"* não repete *"Me chamo Nivelton..."*; pergunta a dúvida.
- **`pickPrimaryCustomerText`** — quando chegam *"Oi"* + pergunta no mesmo lote, processa a pergunta real.
- **Debounce 800ms** (antes 3s) — agrupa mensagens rápidas sem atraso perceptível.
- **Guarda obrigatória** — se nenhuma resposta foi enviada, fallback informativo no `finally` (fim do silêncio).
- **Handoff por tool** sem mensagem ao cliente agora recebe fallback explícito.

## [1.5.75] — 2026-07-27

### Corrigido (silêncio após pergunta sobre Nível / empresa)

- **Perguntas informativas** (*"como o nível pode ser útil para minha empresa"*) usam LLM + base **sem tools** (evita travamento/handoff acidental).
- **`tryInformationalDirectReply`** reativado para dúvidas de produto — resposta garantida com conteúdo da base Nível.
- **`deliverAiReply`** — nunca perde mensagem por bloqueio anti-duplicata.
- **Padrões** ampliados: *queria saber*, *útil para minha empresa*.
- **Fallback informativo** substituído por texto real sobre Nível Cashback (não *"repita sua pergunta"*).

## [1.5.74] — 2026-07-27

### Corrigido (respostas repetidas e triagem robótica)

- **Deploy pendente anterior (`e4b50e4`)** incluído neste pacote: toda mensagem passa pelo LLM.
- **CPF/CNPJ/senha** não disparam mais transferência automática para humano.
- **Triagem automática desativada** — fim das perguntas script *"Em qual sistema ou produto?"*.
- **Debounce padrão 3s** — agrupa *"Olá"* + *"Boa tarde"* em uma só análise da IA.
- **`sendAiWhatsAppReply`** — bloqueia envio duplicado da mesma resposta em 2 minutos.
- **Base RAG** sempre em modo `full` para respostas mais inteligentes.

## [1.5.73] — 2026-07-27

### Alterado (IA sempre analisa — sem respostas automáticas de triagem)

- **`ProcessInboundMessageService`:** removidos fast-paths (saudação, ajuda curta, bypass informativo) e perguntas automáticas de triagem; **toda mensagem passa pelo LLM** com base de conhecimento.
- **`AiPromptBuilder` / `NIVEL_PROMPT`:** "Nível" = marca **Nível Cashback** (nunca nível de pedreiro/medida).
- **Telefone `(17) 99165-8811`:** só quando a IA detecta que não pode resolver (reset/recuperação de senha, conta, etc.); removido de respostas normais vinda da base.
- **`prepareCustomerFacingAiText`:** sanitiza telefone e anexa suporte humano só em escalação de conta.

## [1.5.72] — 2026-07-27

### Corrigido (triagem em pedidos simples de ajuda)

- **`CaseCompletenessEngine`:** reconhece *"pode me ajudar agora?"*, *"consegue me ajudar?"* etc.; não pergunta mais *"Em qual sistema ou produto?"* nesses casos.
- **Fast-path:** resposta amigável pedindo a dúvida real em vez de triagem genérica.

## [1.5.71] — 2026-07-27

### Corrigido (vazamento de instruções internas no WhatsApp)

- **`InformationalDirectReplyService`:** removido fallback que colava trechos crus da base (`Com base no nosso material…`); em falha do LLM usa só resposta segura da marca.
- **`sanitizeAiOutboundText`:** bloqueia textos com regras internas do agente (`# O que o robô nunca deve fazer`, etc.).
- **`KnowledgeContextService`:** seções internas da descrição da base não entram mais no contexto RAG.

## [1.5.70] — 2026-07-27

### Corrigido (painel Fortmax + resposta IA informativa)

- **`corsOrigin`:** sempre permite `https://suporte.fortmax.com.br` (e localhost); callback dinâmico evita bloqueio CORS no socket.io e APIs — painel deixava de atualizar em tempo real.
- **`ProcessInboundMessageService`:** em erro de processamento, tenta resposta informativa da base **antes** da triagem genérica.
- **`InformationalDirectReplyService`:** resposta mais rápida (contexto limitado + fallback por trechos sem esperar LLM longo).
- **`CaseCompletenessEngine`:** reconhece `?`, typos de ajuda e perguntas sobre “como funciona” como intent informativo.
- **Deploy patch:** inclui `helpers/corsOrigin.js`.

## [1.5.69] — 2026-07-26

### Corrigido (IA Nível — base + assets CMS)

- **`KnowledgeContextService`:** lê texto longo do campo **descrição** da base quando não há documentos indexados.
- **RAG CMS sempre ativo na leitura:** assets **Publicado/Indexado** (Word, URL, etc.) entram no contexto mesmo sem `AI_KB_CMS_ENABLED=true`.
- **`RetrievalEngine`:** busca híbrida CMS + legado em paralelo.

## [1.5.68] — 2026-07-26

### Corrigido (IA Nível — base de conhecimento)

- **`getKnowledgeBaseIdsForAgent`:** fallback por marca (Nivelton → bases do domínio Nível Cashback); mescla bases clientes + empresas.
- **`KnowledgeContextService`:** expande busca para todas as bases do mesmo domínio CMS.
- **`InformationalDirectReplyService`:** não vaza texto interno “base limitada”; usa fallback da Nível Cashback quando RAG vazio.

## [1.5.67] — 2026-07-26

### Corrigido (login bloqueado por rate limit)

- **`appFast.ts`:** bloqueio por tentativas excessivas só conta senha errada (`ERR_INVALID_CREDENTIALS`), não Turnstile/sessão; bloqueio reduzido para 3 min; limite 12 tentativas; `LOGIN_RATE_LIMIT_DISABLED=true` para emergência.
- **Frontend pt:** mensagem amigável para `ERR_TOO_MANY_LOGIN_ATTEMPTS`.

## [1.5.66] — 2026-07-26

### Corrigido (crítico — login travado)

- **`Route.js`:** spinner de bootstrap só em rotas privadas; `/login` e `/signup` renderizam imediatamente.
- **`useAuth`:** token expirado libera a tela na hora (refresh em background); timeout de segurança 3s.

## [1.5.65] — 2026-07-26

### Corrigido (crítico — tela de tickets travada + WebSocket)

- **Socket em fortmax.com.br:** passa a usar **polling** (sem upgrade WSS) — Cloudflare/IIS quebravam `wss://api.fortmax.com.br/socket.io`.
- **Spinner infinito:** auth hidrata usuário do JWT na hora; timeout de segurança 12s; rotas privadas não bloqueiam mais por `user.id` ausente.

## [1.5.64] — 2026-07-26

### Corrigido (crítico — robô nunca mais fica em silêncio na FAQ)

- **Sempre responde em dúvida informativa:** LLM → trechos da base → fallback da marca (Nível/Fortmax). Não cai mais no pipeline frágil sem mandar mensagem.
- **“me fala o que a nível pode fazer…”** reconhecido como informativo (typos inclusos).
- **“pode me ajudar ?”** (com espaço) volta ao fast-path de ajuda.
- **“cadê vc / por que não responde”** reengaja a última pergunta real do cliente.

## [1.5.63] — 2026-07-26

### Corrigido (robô continua conversa com a base)

- **Caminho direto informativo:** perguntas “o que é / como funciona / cashback / explique” pulam triagem+tools e respondem com LLM + material da base (`informational_direct_knowledge_path`), mantendo o robô ativo após a saudação.
- **Serviço + testes:** `InformationalDirectReplyService` isolado com suite Jest (21 testes verdes no caminho informativo + CaseCompleteness).

---

## [1.5.62] — 2026-07-26

### Corrigido (crítico — conversa em branco + robô para na saudação)

- **Conversa em branco ao clicar no ticket:** abrir ticket passa `ticketSnapshot`; fetch não fica preso em skeleton; MessageInput não desconecta mais o Socket.io global; supervisão não encadeia páginas de mensagens automaticamente (travava a UI).
- **Robô só saudava:** texto puro não depende mais de storage; em erro de processamento faz recovery com LLM+RAG antes do “instabilidade momentânea”; intenções com `cashback` tratadas como informativas.

---

## [1.5.61] — 2026-07-26

### Corrigido (crítico — robô + Sugerir resposta)

- **Schema triage v2 no bootstrap:** `ApplyAiSchemaService` passa a criar colunas `aiCorrelationId`, `aiProcessingState`, `aiAssist*` e tabela `AiTicketTimelineEvents` — corrige robô que respondia só saudação/copilot que falhava com “Não foi possível gerar sugestão”.
- **Copilot resiliente:** falha ao gravar `aiAssist*` não aborta mais a sugestão.
- **Fila IA:** revalidação repara `queueId` via WhatsApp antes de descartar buffer; mensagens não são apagadas silenciosamente.
- **Wire Fortmax/Nível:** `maxTokens` dos agentes fixado em 4096 (antes 16384 no wiring).
- **Deploy VPS:** `restart-after-deploy.ps1` valida schema triage v2 e executa `enable-triage-v2-company.js`.

---

## [1.5.60] — 2026-07-26

### Corrigido (IA ticket saldo/celular + deploy)

- **Triagem em casos detalhados:** saldo/carteira/troca de celular não disparam mais “Em qual módulo?” após áudio ou descrição completa.
- **Fila IA:** erro definitivo não reprocessa mensagem em loop (evita fallback duplicado).
- **Deploy WinRM:** upload continua **1 ZIP**; chunks base64 voltam **um por chamada WinRM** (`DEPLOY_B64_CHUNK=1500`) — lotes (`DEPLOY_CHUNK_BATCH`) estouravam o limite de linha de comando no Windows.

---

## [1.5.59] — 2026-07-26

### Corrigido (crítico — OOM produção + fallback duplicado)

- **Backend VPS crashava com heap out of memory (~2 GB)** ao processar IA — Node passa a subir com `--max-old-space-size=4096` (`restart-after-deploy.ps1`, `start-production.cmd`).
- **Fallback duplicado:** dedupe Redis em `sendAiCustomerFallback` + limite de retries inline na fila.
- **Tokens informativos:** teto reduzido de 16384 → 4096 para aliviar memória na completion.

---

## [1.5.58] — 2026-07-25

### Corrigido (crítico — IA, ativos CMS, aba Atendimentos)

- **Mensagem de instabilidade duplicada:** fallback transitório enviado só após esgotar retries da fila (não a cada tentativa).
- **“Me explique o nível” ia para triagem:** intenções informativas (`explique`/`explicar`, `nível`, `para que serve`, fidelização) passam direto para LLM+RAG.
- **Indexação CMS falhava:** `knowledgeDocumentId` nullable no bootstrap (`ApplyAiSchemaService`) — corrige insert de chunks CMS sem documento legado.
- **Ativos CMS:** `DELETE /ai/assets/:id`, arquivar em rascunho/revisão/aprovado, ação **Excluir ativo** no menu.
- **Aba IA em Atendimentos travada:** polling com lista vazia não mantém mais skeleton infinito (`useTickets`).
- **Contexto RAG CMS:** `KnowledgeContextService` considera chunks publicados do CMS além de documentos legados.

---

## [1.5.57] — 2026-07-25

### Corrigido (crítico — deploy patch + copilot Nível)

- **Deploy WinRM instável:** `deploy-vps-backend.py` usa retry por chunk, verificação de partes faltantes, retry completo do upload e `-EncodedCommand` para payloads grandes — corrige `part count mismatch` e `The command line is too long`.
- **Copilot confundia “Nível” com medida:** copilot agora usa persona do agente (`basePrompt`) + regra explícita de que Nível é a marca Nível Cashback.
- **Prompt Nivelton:** reforço em `NIVEL_PROMPT` e regras operacionais para nunca tratar “Nível” como nível genérico.
- **Socket na IA:** `emitTicketStateRefresh` não derruba mais o processamento se Socket.io estiver indisponível.

---

## [1.5.56] — 2026-07-25

### Corrigido (crítico — IA parava na 2ª mensagem e copilot)

- **Robô respondia só ao “oi”:** fila **Suporte Nível** (`schedules: {}`) quebrava `VerifyCurrentSchedule` (`jsonb_array_elements` em objeto JSON). Perguntas reais falhavam silenciosamente após a saudação. Agora `{}`, `[]` ou horário inválido assumem fila **aberta** (`inActivity: true`).
- **Sugerir resposta falhava:** tabela `AiCopilotSuggestions` ausente no banco (migration marcada mas tabela não existia). `ApplyAiSchemaService` passa a recriar a tabela no bootstrap; emissão socket do copilot não derruba a sugestão se o Socket.io estiver indisponível.

---

## [1.5.55] — 2026-07-25

### Corrigido (supervisão IA e ativos)

- **Botões sumiam após Participar:** toolbar exige `isAiSupervisionTicket` (inclui IA pausada).
- **Retomar IA:** botão visível com `aiPaused + aiAgentId`; `/ai/resume` reengaja última mensagem do cliente.
- **Copilot na supervisão:** Sugerir resposta funciona sem aceitar ticket (`observationMode`).
- **Ativos — substituir arquivo:** modal "Substituir arquivo" + `POST /ai/assets/:id/replace-file` (reupload + reindexação).
- **Ativos — download:** stream binário com `Content-Disposition`; fallback URL assinada.
- **Indexação CMS:** migration `knowledgeDocumentId` nullable em `KnowledgeChunks` (corrige NOT NULL na Fase 2).

---

## [1.5.54] — 2026-07-25

### Corrigido

- **DOCX falhando na indexação ("Corrupted zip"):** download local lia binário como UTF-8; chave B2 truncada no ingest legado; repositório gravava URL pública em vez da chave. Helper unificado `resolveKnowledgeStorageKey`.
- **Download de anexos na base:** endpoint `GET /ai/assets/:id/download` + botão "Baixar anexo" em Ativos.
- **Participar na supervisão IA:** admin pode enviar mensagem em ticket `pending` atendido pela IA (antes: `ERR_TICKET_NOT_OPEN`).
- **Sugerir resposta na supervisão:** copilot liberado sem `userId` quando ticket está sob IA.
- **Robô parava silenciosamente:** handoff forçado agora sempre executa `HandoffToHumanService` (não retorna vazio no Triage V2).
- **Lista piscando:** skeleton só quando lista vazia; polling IA usa merge incremental (fetchSince) em vez de refetch completo a cada 2s.
- **Tempo real mais rápido:** WebSocket habilitado em fortmax.com.br; poll de mensagens a cada 1,5s como fallback.

---

## [1.5.53] — 2026-07-25

### Corrigido (crítico)

- **Sistema travado no spinner (auth/assets):** removido XHR síncrono de `config.json`/`gitinfo.json` que bloqueava a thread principal; config carregada de forma assíncrona antes do App montar; `refresh_token` agora sempre hidrata `user.id` do JWT.
- **Bases/ativos não carregavam:** retry com backoff (até 10×) para rotas pesadas (`503 ERR_HEAVY_ROUTES_LOADING`) em páginas IA e cliente API global (8 retries).
- **Tempo real da mesa (IA digitando / lista):** `emitTicketStateRefresh` emitia nos canais Socket.io errados (`open`/`pending` em vez de `company-{id}-{status}`).
- **Robô parava na 2ª mensagem:** `finalizeAiResponse` agora roda sempre após resposta bem-sucedida; estado `processing` limpo também em resolução/fechamento.
- **Anexo “Respostas anexas” com CMS:** categoria `respostas-supervisionadas` criada automaticamente (antes falhava com `categoryId required`).

---

## [1.5.52] — 2026-07-25

### Corrigido (crítico)

- **Conversa não carregava:** polling IA fazia `RESET` a cada 1s → spinner infinito; agora faz merge incremental a cada 2s.
- **Ativos/bases “Carregando…”:** timeout API 90s×3 retries; reduzido para 45s×2; estados separados para bases vs ativos; `safeAiQuery` no list de assets.
- **IA parava na 2ª mensagem:** lock Redis stale liberado após 20–45s; TTL lock 120s; reengage em 5s; limpeza automática de `aiProcessingState=processing`.
- **Admin sem ação na mesa:** supervisão estendida a tickets com `aiAgentId` mesmo quando `aiPaused`.

---

## [1.5.51] — 2026-07-25

### Corrigido

- **Build SPA:** ícone `LightbulbOutlined` inexistente no MUI v4 → `EmojiObjects`.
- **Tempo real IA:** `syncTicketView` ignorava mudanças em `aiProcessingState` — indicador "IA digitando" não atualizava.

### Adicionado / melhorado

- Base **Respostas anexas** por linha: `respostas-anexas-nivel` (domínio Nível, agente Nivelton) e `respostas-anexas-fortmax` (Webin); anexo resolve marca pelo ticket.
- **maxTokens** Nivelton/Webin: 16384 no wiring; consultas informativas usam até 16384 tokens.

---

## [1.5.50] — 2026-07-25

### Adicionado

- **Supervisão IA:** botões **Participar** (admin escreve na conversa), **Sugerir resposta** (copilot + dialog anexar à base), base **Respostas anexas** (`EnsureAnnexResponsesKnowledgeBase`, `POST /tickets/:id/ai/annex-response`).
- **Tempo real IA:** indicador "IA digitando…" via `aiProcessingState=processing` + emit socket no processamento; poll ticket 1s na conversa IA.

### Corrigido

- **Deploy Windows:** `verify-heavy-routes-ready.js` usa só `require()` (sem `import()` ESM com path `c:`).

---

## [1.5.49] — 2026-07-25

### Corrigido

- **Produção 503 (API inteira fora):** deploy `patch` enviava `aiRoutes.js` novo sem `KnowledgeAssetController.js` — Express falhava ao registrar rotas CMS (`heavyRoutesError`). Patch passa a incluir controllers CMS + pasta `KnowledgeCms/**`.
- **CI/deploy:** `verify-heavy-routes-ready.js` no build e restart; health exige `heavyRoutes: true` (não só HTTP 200).

---

## [1.5.48] — 2026-07-25

### Adicionado

- **CMS Ativos (`/ai/assets`):** UI com abas Arquivo/Texto/Site, botão **Salvar documento**, publicação automática, ver/editar/publicar/copiar para outra base; endpoints `POST /ai/assets/url`, `/clone`, `/quick-publish`.
- **Tempo real:** polling **2s** na aba IA (lista) e **1s** no chat quando ticket está com IA; ticket recarregado no socket antes de emitir `appMessage`.

### Corrigido

- **Indexação B2/DOCX:** `resolveStorageKey` nos handlers CMS usa `extractStorageKeyFromUrl` (path `companies/{id}/...` completo).
- **IA silenciosa:** fast path para `Pode ajudar?`/mensagens curtas; reengajamento deferido 8s; limpeza de lock Redis stale.
- **Prompt IA:** instruções para sites institucionais e conteúdo com imagens descritas no texto extraído.

---

## [1.5.47] — 2026-07-25

### Corrigido

- **IA parava após 1ª resposta:** fila Redis recoloca mensagens no buffer se o processamento falhar; follow-up roda após liberar lock; ticket mantém o mesmo agente (`resolveProcessingAgent`, role `legacy`); triage não bloqueia FAQ após saudação.

---

## [1.5.46] — 2026-07-25

### Corrigido

- **Lista em tempo real (aba IA):** eventos WebSocket passam a chegar na lista mesmo com IA ativa (`suppressHumanAlert` só silencia som, não bloqueia socket); ticket emitido após `tryEngageAi` e após respostas rápidas; aba IA assina canais `pending`+`open`; removido delete indevido na aba IA.
- **IA silenciosa em FAQ** (`como funciona`, `quero saber`): triage não bloqueia; base carregada integralmente; até 4096 tokens; lock Redis não apagado durante processamento ativo.

---

## [1.5.45] — 2026-07-25

### Corrigido

- **Deploy CI (LOCK_HELD):** lock na VPS usa PID do Windows; detecta lock órfão (processo morto); lê stderr no retry; stale default 10 min.

---

## [1.5.44] — 2026-07-25

### Performance (meta ~5s de resposta IA)

- Lock Redis retry: **100ms** (`AI_QUEUE_LOCK_RETRY_MS`, antes 750ms).
- Saudações puras (`oi`, `olá`) — fast path sem LLM/RAG.
- Bases ≤12 documentos — skip embedding, chunks direto do Postgres.
- Histórico 4 msgs; orquestrador só quando habilitado.

---

## [1.5.43] — 2026-07-25

### Corrigido

- **WhatsApp Nível sem atendimento IA:** wiring Fortmax/Nível independente no startup; `EnsureAiFirstResponder` não sobrescreve filas de marca; resolução de fila em WhatsApp multi-fila prefere fila com agente; reengajamento automático de tickets pendentes sem `aiAgentId`; endpoint `POST /ai/wire-support-lines` para religar Nivelton + bases manualmente.

---

## [1.5.42] — 2026-07-25

### Corrigido

- **Zerar base de clientes (definitivo):** deletes em tabelas IA opcionais inexistentes no Supabase (`AiKnowledgeSuggestions`, `AiCopilotSuggestions`, `AiReplayLogs`) abortavam a transação Postgres (42P01) — o código ignorava o erro JS mas a transação já estava morta (25P02). Agora cada SQL usa `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` ao pular tabela ausente.

---

## [1.5.41] — 2026-07-24

### Corrigido

- **IA silenciosa (Nivelton / Nível Cashback):** triagem não marca mais mensagem como "handled" sem enviar resposta quando a pergunta de investigação seria repetida; LLM vazio/baixa confiança ou erro de provider envia fallback ao cliente em vez de `return` mudo; detecção de identidade do bot não intercepta FAQs ("qual o nome do produto", "quero saber mais do Nível"); fila IA reprocessa buffer após lock Redis.
- **Mensagens sem F5:** `MessagesList` deixa de chamar `socket.disconnect()` a cada update de ticket (removia listener/`joinChatBox`); usa `socket.off` + `joinChatBox` imediato; reconexão socket reentra nas salas mesmo com sessão recuperada.

---

## [1.5.40] — 2026-07-24

### Corrigido

- **Zerar base de clientes (`ERR_WIPE_CUSTOMER_BASE_FAILED`):** `ResetTestEnvironmentService` passa a executar deletes SQL **sequencialmente** na transação (node-pg não suporta queries paralelas na mesma conexão) e usa subqueries por `companyId` em vez de listas `IN` com milhares de IDs; log Postgres com `constraint`/`detail` no controller.

---

## [1.5.42] — 2026-07-25

### Corrigido

- **Lista de tickets em tempo real (IA):** mensagens inbound passam a emitir `websocketUpdateTicket`; frontend atualiza preview mesmo com `suppressHumanAlert`.
- **IA parada com ticket ativo:** reengajamento inclui tickets com `aiAgentId` quando última msg é do cliente; limpa lock Redis stale e estado `processing` preso.

---

## [1.5.41] — 2026-07-25

### Adicionado / corrigido

- **Auditoria multi-marca:** `AuditSupportLinesService` valida WhatsApp → fila → agente → domínio → bases; `GET /ai/audit-support-lines`; `npm run audit:support-lines`.
- **Wire reforçado:** padrões de fila/agente/base ajustados (WebG3/Fortmax vs Nível); wire executa auditoria ao final e falha se cadeia incompleta.

---

## [1.5.40] — 2026-07-25

### Corrigido

- **WhatsApp “conectado” mas sem mensagens:** watchdog e startup detectam sessão zombie (socket morto ou listener ausente), reanexam `messages.upsert` e reiniciam a sessão; logs `Inbound WhatsApp message received` no backend.

---

## [1.5.39] — 2026-07-24

### Corrigido

- **IA silenciosa após 1ª resposta:** triagem v2 não engole FAQs/informativas — `sendInvestigationResponse` retorna `false` e o fluxo segue para LLM/RAG; identidade (Nivelton/Webin) sempre finaliza `aiProcessingState`; `finally` desbloqueia tickets presos em `processing`.
- **Fila IA imediata (`AI_QUEUE_DEBOUNCE_MS=0`):** mensagens recebidas durante lock Redis agendam retry (~750ms) em vez de ficarem só no buffer.
- **Zerar base de clientes:** delete de `OutOfTicketMessages` por `whatsappId`; controller com log e `ERR_WIPE_CUSTOMER_BASE_FAILED`.

---

## [1.5.38] — 2026-07-24

### Corrigido

- **Zerar base de clientes:** delete de `OldMessages` antes de `Messages` (FK que causava 500); limpeza reforçada.
- **Lista de tickets:** filtro por linha WhatsApp (chips Fortmax / Web G3 / Nível etc.) na barra lateral; API `GET /tickets?whatsappIds=[...]`.

---

## [1.5.37] — 2026-07-24

### Corrigido

- **IA multi-marca:** `WireSupportLinesService` roda no startup e no deploy VPS; WhatsApp **Nível** (nome genérico) é detectado; bootstrap não sobrescreve filas com agente dedicado; prompt operacional e identidade respeitam Nivelton vs Webin.
- **Zerar base de clientes:** wipe sem confirmação; SQL extra (`quotedMsgId`, `TicketNotes`); um clique limpa contatos + tickets + UI.

---

## [1.5.36] — 2026-07-24

### Corrigido

- **IA multi-marca (Fortmax vs Nível):** roteamento por fila do WhatsApp antes da IA responder; removido fallback que usava o primeiro agente Fortmax em qualquer número; tickets novos recebem fila automaticamente quando a conexão tem 1 fila; script `npm run wire:support-lines` liga Web G3↔Fortmax e Nível↔Nível Cashback.

---

## [1.5.35] — 2026-07-24

### Corrigido / adicionado

- **Erro 400 ao cadastrar WhatsApp:** handler global de erros no `appFast`; códigos `ERR_WAPP_*`; token opcional por empresa.
- **IA → Base de Conhecimento:** descrição truncada com "Ver tudo".
- **IA → Agentes:** bases de conhecimento visíveis também para tipo **Legado**; campo **Fila de atendimento (WhatsApp)** liga agente ↔ fila ↔ bases; vínculo exclusivo por fila no backend.
- **Script:** `npm run wire:nivel-support` (COMPANY_ID=1) — liga Nivelton + Suporte Nível + bases clientes/empresa + WhatsApp Nível Velo.

---

## [1.5.34] — 2026-07-24

### Corrigido (hotfix)

- **Travamento total da página:** loop infinito `syncTicketView` ↔ `currentTicket` removido; listas não zeram a cada refresh; socket Fortmax usa polling estável.

---

## [1.5.33] — 2026-07-24

### Corrigido / performance

- **Lentidão extrema:** removido log `onAny` do socket (centenas de milhares de mensagens no console); refresh debounced; ticket não recarrega com spinner a cada sync de lista; WebSocket cai para polling após falhas.
- **Notificações:** deduplicadas e limitadas a 40; badge capped em 99.

---

## [1.5.32] — 2026-07-24

### Corrigido / performance

- **Assumir do robô:** API responde sem esperar envio WhatsApp (notificação em background); UI atualiza na hora (optimistic) com spinner só no botão clicado.

---

## [1.5.31] — 2026-07-24

### Corrigido

- **Lista de tickets:** aceitar conversa atualiza abas Atendendo/Aguardando/IA sem F5; ticket assumido por humano sai da aba IA.
- **Conversa em tempo real:** mensagens enviadas aparecem na tela imediatamente (POST retorna mensagem + refresh local); ticket sincroniza ao aceitar sem debounce longo.
- **Copiloto:** estado do ticket atualizado ao assumir — botão Sugerir resposta passa a consultar a IA.

---

## [1.5.30] — 2026-07-24

### Corrigido

- **Deploy Contabo — lock:** `acquire_deploy_lock` usa idade do arquivo `.deploy.lock` (não resíduos em `C:\ticketz\dc`); CI aguarda até 30 min (`DEPLOY_LOCK_WAIT_SEC=1800`); limpeza de staging ao liberar lock.

---

## [1.5.29] — 2026-07-24

### Corrigido / alterado

- **Identidade Webin:** resposta fixa *Me chamo Webin, Assistente Virtual da Fortmax.* para perguntas sobre nome; agente renomeado de `Atendente Inicial` → `Webin` (migration).
- **Triagem fora de contexto:** conversas sobre nome/agradecimento/aguardar horário não disparam mais *Em qual sistema ou produto isso está acontecendo?*

---

## [1.5.28] — 2026-07-24

### Corrigido

- **Aceitar conversa (409):** `assumeTicketFromBot` idempotente para o mesmo atendente; elegibilidade ampliada (`isAssumeEligibleTicket`); master admin reconhecido em `assertCanAcceptTicket`.
- **Fechar conversa na lista:** diálogo com nota opcional, toast de confirmação e atualização imediata da lista.
- **Zerar base de clientes:** broadcast socket `wipe` + `refreshTicketLists` — UI limpa sem F5.

---

## [1.5.27] — 2026-07-23

### Corrigido

- **IA enviando pergunta de suporte após resposta comercial:** triagem v2 deixava de reconhecer intenção informativa (`quero saber`, `como pode ajudar`, etc.) e disparava *Em qual tela, módulo ou funcionalidade você encontrou esse problema?* logo após resposta útil. `CaseCompletenessEngine.isInformationalIntent` + guarda em `sendInvestigationResponse` para aguardar o cliente.

---

## [1.5.26] — 2026-07-23

### Corrigido

- **Botão Fechar na lista de tickets:** overlay de ações reposicionado acima do card (`z-index`, área clicável maior); badge de não lidas não sobrepõe mais os ícones
- **500 ao zerar base / fechar conversas:** wipe em SQL + Sequelize com transação; contador IA e logs operacionais não derrubam mais o fechamento
- **Admin master:** `fernandofortmax@gmail.com` (e `MASTER_ADMIN_EMAILS`) reconhecido como master admin — migration garante `super=true`; bypass de permissão em operações críticas

---

## [1.5.25] — 2026-07-23

### Corrigido

- **500 em Zerar base de clientes:** `ResetTestEnvironmentService` agora apaga todas as dependências (timeline IA, sugestões, mídia B2, memória de contato, logs de tools etc.) em transação antes de remover tickets e contatos — evita violação de FK e erro 500.

---

## [1.5.24] — 2026-07-23

### Corrigido

- **403 ao assumir ticket da IA:** `UpdateTicketService` permitia aceite `pending→open` sem fila só para admin ou handoff; tickets `Atendido pela IA` (`isAiHandlingTicket`) agora passam no gate. Frontend usa `POST /tickets/:id/ai/assume` também nesse estado e oculta botão Aceitar genérico para tickets da IA.

---

## [1.5.23] — 2026-07-23

### Corrigido

- **Deploy Contabo WinRM:** restart movido para `restart-after-deploy.ps1` — evita `The command line is too long` no Windows

---

## [1.5.22] — 2026-07-23

### Corrigido

- **500 em tickets:** schema de media lifecycle (`permanentDelete*` / `MessageMediaFiles.status`) agora é aplicado no `apply-db-schema` (idempotente)
- **Deploy Contabo:** `verify-runtime-ready.js` bloqueia restart se faltar módulo npm ou coluna no banco
- Listagem de mensagens não cai se resolução de URL de mídia falhar

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
