# IA Automática — Configuração e Testes

Este documento descreve como configurar e testar o atendimento automático por IA no Ticketz.

## Variáveis de ambiente

### WhatsApp — imagens, áudios e documentos

Toda mídia pesada recebida ou enviada nas conversas WhatsApp passa pelo `StorageService`:

- Imagens → `suporte/{companyId}/media/images/...`
- Áudios → `suporte/{companyId}/media/audio/...`
- Vídeos → `suporte/{companyId}/media/video/...`
- Documentos/PDFs → `suporte/{companyId}/media/documents/...`
- Outros anexos → `suporte/{companyId}/media/attachments/...`

**Textos e metadados das conversas** permanecem no Postgres (`Messages.body`, tickets, etc.).

No banco (`Messages.mediaUrl`) fica a **URL pública do B2** (quando configurado) ou a chave local (fallback).

### Backblaze B2 (armazenamento de mídias e documentos)

**Produção Fortmax:** as credenciais B2 ficam em **Administração → Configurações → Armazenamento** (tabela `Settings`), não no Wrangler.

Chaves suportadas (com aliases legados):

| Chave canônica | Aliases aceitos |
|----------------|-----------------|
| `storageProvider` | `backblaze` (padrão), `s3`, `r2`, `minio` |
| `b2ApplicationKeyId` | `B2_APPLICATION_KEY_ID`, `B2_KEY_ID` |
| `b2ApplicationKey` | `B2_APPLICATION_KEY` |
| `b2Bucket` | `B2_BUCKET`, `B2_BUCKET_NAME` |
| `b2Endpoint` | `B2_ENDPOINT` |
| `b2PublicUrl` | `B2_PUBLIC_URL` |

Organização no bucket (mesma branch/conta B2 existente):

```
suporte/{companyId}/media/...
suporte/{companyId}/knowledge/...
```

Override opcional via env (dev/CI):

```env
STORAGE_ROOT_PREFIX=suporte
B2_APPLICATION_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET=nome-do-bucket
B2_ENDPOINT=https://s3.us-west-000.backblazeb2.com
B2_PUBLIC_URL=https://f000.backblazeb2.com/file/seu-bucket
```

> Se nem banco nem env tiverem credenciais, o sistema usa armazenamento local em `public/` como fallback.

### OpenAI (obrigatório para IA)

A chave **não** deve ficar no `.env` do servidor.

Configure no painel:

**Administração → Configurações → Serviços externos → OpenAI → AI Key**

Opcionalmente defina o provedor em `aiProvider` (`openai` ou `groq`).

### URL do backend (recomendado para visão de imagens)

```env
BACKEND_URL=https://seu-dominio.com
```

Usada para montar URL pública de imagens quando o storage é local.

## Banco de dados (Supabase / Postgres)

### Migrations automáticas (opcional)

Por padrão, **migrations não rodam sozinhas** em produção — é o comportamento mais seguro.

| Variável | Padrão | Efeito |
|----------|--------|--------|
| `AUTO_MIGRATE` | `false` | Se `true`, aplica migrations pendentes na inicialização do backend |

Quando há migrations pendentes e `AUTO_MIGRATE` está desligado:

- O backend **inicia normalmente**, mas **desabilita funcionalidades de IA** até o banco estar atualizado
- Logs de erro listam as migrations pendentes
- **Administração → IA → Diagnóstico** mostra o status e as pendências

**Recomendação produção:** rode migrations uma vez com `AUTO_MIGRATE=true` no deploy, ou execute `npm run db:migrate` manualmente, depois mantenha `AUTO_MIGRATE` desligado.

### Fila assíncrona de IA

O processamento inbound da IA roda em `AiInboundQueue` (Bull + Redis). O listener do WhatsApp apenas persiste e enfileira.

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `AI_QUEUE_CONCURRENCY` | `5` | Jobs processados em paralelo |
| `AI_QUEUE_DEBOUNCE_MS` | `2000` | Agrupa mensagens rápidas do mesmo ticket |
| `AI_QUEUE_MAX_ATTEMPTS` | `3` | Retries para falhas transitórias |
| `AI_QUEUE_BACKOFF_MS` | `3000` | Backoff inicial entre retries |
| `AI_QUEUE_CONGESTION_THRESHOLD` | `50` | Limite de jobs pendentes para alerta |
| `AI_QUEUE_LOCK_TTL_SEC` | `300` | TTL do lock por ticket |

Métricas da fila aparecem em **IA → Diagnóstico**.

### ACK opcional por agente

Em **IA → Agentes**, cada agente pode habilitar mensagem automática ao receber a mensagem do cliente (enviada antes do processamento da IA).

### Tabelas criadas

A migration `20260707100000-create-ai-and-knowledge-tables` cria:

- `AiAgents`
- `AiAgentQueues`
- `KnowledgeBases`
- `KnowledgeDocuments`
- `KnowledgeChunks` (com `pgvector`)
- `AiConversationLogs`
- `MessageMediaFiles`

Execute:

```bash
cd backend
npm run build
npm run db:migrate
```

### Validar no painel (sem SQL Editor)

**Administração → IA → Diagnóstico** verifica automaticamente:

- Conexão com banco e extensão pgvector
- Tabelas, índices e migrations pendentes
- Storage (B2/local), provider de IA e conectividade
- Embeddings, agente ativo, bases prontas, WhatsApp e último processamento

Use **Executar diagnóstico novamente** para testes ao vivo (inclui ping ao provider).

### Validar via API

```http
GET /ai/health
GET /ai/diagnostics
POST /ai/diagnostics/run
```

### Validar no Supabase (opcional)

```bash
# SQL Editor: scripts/validate-ai-setup.sql
```

### Seed WEBG3 (agente + FAQ)

```bash
# SQL Editor: scripts/seed-webg3-ai.sql
cd backend
npm run ingest:pending
```

**Requisito:** extensão `vector` habilitada no Postgres/Supabase.

## Configuração no painel

### Assistente de primeiro uso

Quando não há agente cadastrado, o painel exibe um assistente guiado em **IA → Agentes** e **IA → Base de Conhecimento**:

1. Configurar Provider de IA
2. Configurar API Key
3. Criar Agente
4. Criar Base
5. Adicionar primeiro documento
6. Executar teste (Playground ou WhatsApp)

Se não existir nenhuma base, o sistema oferece criar um **ambiente de demonstração** (Base *Teste*, Agente *Assistente de Teste*, documento de horário) — removível pelo painel.

### Playground (teste sem WhatsApp)

**Administração → IA → Playground** permite escolher agente e base, enviar perguntas e ver:

- Resposta da IA
- Chunks e documentos utilizados
- Tokens, custo aproximado e tempo de resposta

### 1. Menu IA → Agentes

Crie um agente com:

| Campo | Exemplo |
|-------|---------|
| Nome | Atendente Virtual |
| Ativo | Sim |
| Modelo de texto | gpt-4o-mini |
| Modelo de visão | gpt-4o-mini |
| Modelo de transcrição | gpt-4o-mini-transcribe |
| Fila de transferência | Suporte |
| Prompt base | Você é o assistente da empresa X... |
| Mensagem de transferência | Vou transferir para um atendente humano... |

### 2. Menu IA → Base de Conhecimento

Crie bases, por exemplo:

- Suporte WEBG3
- Financeiro
- Comercial
- Institucional

### 3. Menu IA → Documentos

- **Upload:** PDF, DOCX, TXT, Markdown, HTML
- **Texto manual:** título + conteúdo

O sistema processa automaticamente:

1. Extrai texto
2. Divide em chunks
3. Gera embeddings (`text-embedding-3-small`)
4. Salva vetores no `pgvector`

### 4. Conexão WhatsApp

Mantenha a conexão WhatsApp ativa em **Administração → Conexões**.

## Fluxo de atendimento

```
Cliente envia mensagem no WhatsApp
        ↓
Ticketz recebe (wbotMessageListener)
        ↓
Existe agente IA ativo?
   Não → fluxo humano/chatbot normal
   Sim → ProcessInboundMessageService
        ↓
Áudio? → Upload B2 → Transcrição OpenAI
Imagem? → Upload B2 → Análise com visão
        ↓
RAG: busca chunks relevantes (pgvector)
        ↓
IA responde com base no conhecimento
        ↓
Confiança baixa / pedido de humano / tema sensível?
   Sim → Transferência para fila humana
   Não → Resposta automática no WhatsApp
```

## Quando transfere para humano

- Cliente pede humano, atendente, suporte, financeiro ou gerente
- Assuntos sensíveis (cancelamento, contrato, cobrança, CPF...)
- Sem trechos confiáveis na base de conhecimento
- IA indica que não sabe responder
- Erro no processamento
- Ticket assumido por atendente humano

## Passo a passo de teste

### Pré-requisitos

- [ ] **IA → Diagnóstico** com status geral OK (sem migrations pendentes)
- [ ] OpenAI Key configurada no painel
- [ ] B2 configurado (ou fallback local aceito)
- [ ] Agente IA ativo criado (ou ambiente de demonstração)
- [ ] Base de conhecimento com documentos em status `ready`
- [ ] **IA → Playground** respondendo corretamente
- [ ] WhatsApp conectado

### Teste 1 — Resposta automática

1. Envie mensagem de texto para o WhatsApp conectado
2. Verifique resposta automática da IA
3. Confira em **IA → Logs**

### Teste 2 — Base de conhecimento (RAG)

1. Cadastre documento com FAQ conhecida
2. Aguarde status `ready`
3. Pergunte algo que está no documento
4. A IA deve responder com base no conteúdo

### Teste 3 — Áudio

1. Envie mensagem de áudio no WhatsApp
2. Verifique transcrição e resposta
3. Confira `MessageMediaFiles.transcription_text` (via logs)

### Teste 4 — Imagem

1. Envie imagem no WhatsApp
2. Verifique se a IA descreve e responde
3. Confira `MessageMediaFiles.vision_summary`

### Teste 5 — Transferência para humano

1. Envie: "quero falar com um atendente"
2. Verifique mensagem de transferência
3. Ticket deve aparecer em **Atendimentos → Aguardando**
4. IA não deve mais responder nesse ticket

### Teste 6 — Atendente humano assume

1. Atendente aceita o ticket
2. Envie nova mensagem do cliente
3. IA **não** deve responder (ticket com `userId`)

## API administrativa

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/ai/agents` | Listar agentes |
| POST | `/ai/agents` | Criar agente |
| PUT | `/ai/agents/:id` | Atualizar agente |
| DELETE | `/ai/agents/:id` | Remover agente |
| GET | `/ai/knowledge-bases` | Listar bases |
| POST | `/ai/knowledge-bases` | Criar base |
| GET | `/ai/documents` | Listar documentos |
| POST | `/ai/documents/text` | Texto manual |
| POST | `/ai/documents/upload` | Upload arquivo |
| GET | `/ai/logs` | Logs de conversas |
| GET | `/ai/health` | Health check consolidado |
| GET | `/ai/diagnostics` | Diagnóstico (cache) |
| POST | `/ai/diagnostics/run` | Diagnóstico ao vivo |
| GET | `/ai/setup/status` | Status do assistente de configuração |
| POST | `/ai/setup/demo` | Criar ambiente de demonstração |
| POST | `/ai/playground` | Testar agente sem WhatsApp |

## Segurança

- API Keys nunca aparecem nos logs
- CPF/CNPJ mascarados nos logs
- IA não responde ticket já assumido por humano
- Isolamento por `companyId` em todas as tabelas
- RAG busca apenas chunks da empresa do ticket

## Arquitetura de arquivos

```
backend/src/
├── services/
│   ├── AiServices/
│   │   ├── ProcessInboundMessageService.ts  ← orquestração WhatsApp
│   │   ├── ModelGateway.ts                  ← OpenAI
│   │   ├── RetrievalEngine.ts               ← pgvector RAG
│   │   ├── IngestKnowledgeDocumentService.ts
│   │   └── HandoffToHumanService.ts
│   └── StorageService/
│       ├── StorageService.ts                ← upload único
│       └── BackblazeB2Adapter.ts
├── controllers/                             ← API admin IA
└── routes/aiRoutes.ts

frontend/src/pages/
├── AiAgents/
├── AiKnowledgeBases/
├── AiDocuments/
└── AiLogs/
```
