# Backend

Índice temático. **Conteúdo completo:** [`MANUAL_PLATAFORMA.md`](MANUAL_PLATAFORMA.md)

## Seções do manual

| Tópico | Seção |
|--------|-------|
| Arquitetura e startup | [§2](MANUAL_PLATAFORMA.md#2-visão-geral-da-arquitetura) |
| Estrutura pastas | [§35 — Backend](MANUAL_PLATAFORMA.md#35-estrutura-de-pastas--backend) |
| Serviços | [§37 — Serviços principais](MANUAL_PLATAFORMA.md#37-serviços-principais-e-responsabilidades) |
| Filas e roteamento IA | [§9](MANUAL_PLATAFORMA.md#9-filas-e-chatbot) |
| Filas Bull | [§17](MANUAL_PLATAFORMA.md#17-filas-de-processamento-bullredis) |

## Stack

- Node.js, Express, TypeScript, Sequelize, Bull, Socket.io
- Entrada: `backend/src/server.ts`
- WhatsApp: `libzapitu-rf` via `backend/src/libs/wbot.ts`

## Diretórios principais

```
backend/src/
├── controllers/     # 47 controllers
├── routes/          # 36 route modules
├── services/        # domínios (AiServices, WbotServices, TicketServices…)
├── models/          # 56 Sequelize models
├── middleware/      # isAuth, isCompliant, requireAiPlatformReady…
├── database/migrations/
└── queues.ts        # Bull workers
```

## Comandos

Ver [`AGENTS.md`](../AGENTS.md): `npm run build`, `dev:server`, `db:migrate`, `lint`.

## Regra de atualização

Novo serviço/controller → §35, §37, seção de domínio. Ver [`/.documentation-rules.md`](.documentation-rules.md).
