# Frontend

Índice temático. **Conteúdo completo:** [`MANUAL_PLATAFORMA.md`](MANUAL_PLATAFORMA.md)

## Seções do manual

| Tópico | Seção |
|--------|-------|
| Menu e rotas | [§5 — Menu e módulos](MANUAL_PLATAFORMA.md#5-menu-e-módulos-do-painel) |
| Permissões UI | [§4 — Perfis](MANUAL_PLATAFORMA.md#4-perfis-de-usuário-e-permissões) |
| Estrutura pastas | [§36 — Frontend](MANUAL_PLATAFORMA.md#36-estrutura-de-pastas--frontend) |
| i18n | [§19 — Internacionalização](MANUAL_PLATAFORMA.md#19-internacionalização-i18n) |
| Escopo de marca na lista de tickets | [§Brand — Escopo de marca na lista de tickets](MANUAL_PLATAFORMA.md#escopo-de-marca-na-lista-de-tickets) |

## Stack

- React 17, Material-UI v4, Create React App 5
- JavaScript (não TypeScript)
- Entrada: `frontend/src/App.js` → `frontend/src/routes/index.js`

## Arquivos-chave

| Arquivo | Função |
|---------|--------|
| `layout/MainListItems.js` | Menu lateral |
| `rules.js` | Permissões `<Can>` |
| `context/Socket/SocketContext.js` | WebSocket |
| `context/Tickets/TicketsContext.js` | Ticket ativo, abas, refresh e reconciliação de mensagens otimistas |
| `context/BrandScope/BrandScopeContext.js` | Marca selecionada no cabeçalho — vale para o sistema inteiro |
| `hooks/useTickets/index.js` | Busca de `/tickets` (inclui `brandIds`) + cache de sessão |
| `pages/Ai*` | Módulo IA (11 páginas: agentes, bases, domínios, assets, playground, etc.) |
| `translate/i18n.js` | i18n (fallback `pt`) |

## Regra de atualização

Nova rota/página/menu → §5, §36. Permissões → §4. Ver [`/.documentation-rules.md`](.documentation-rules.md).
