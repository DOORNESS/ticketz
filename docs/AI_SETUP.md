# IA Automática — Configuração e Testes

Este documento descreve como configurar e testar o atendimento automático por IA no Ticketz.

## Variáveis de ambiente

### Backblaze B2 (armazenamento de mídias e documentos)

```env
B2_APPLICATION_KEY_ID=sua_key_id
B2_APPLICATION_KEY=sua_application_key
B2_BUCKET=nome-do-bucket
B2_ENDPOINT=https://s3.us-west-000.backblazeb2.com
B2_PUBLIC_URL=https://f000.backblazeb2.com/file/seu-bucket
```

> Se as variáveis B2 não estiverem configuradas, o sistema usa armazenamento local em `public/` como fallback.

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

**Requisito:** extensão `vector` habilitada no Postgres/Supabase.

## Configuração no painel

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

- [ ] Migration executada
- [ ] OpenAI Key configurada no painel
- [ ] B2 configurado (ou fallback local)
- [ ] Agente IA ativo criado
- [ ] Base de conhecimento com documentos em status `ready`
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
