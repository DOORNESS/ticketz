# Roadmap e evolução

Índice temático. **Conteúdo completo:** [`MANUAL_PLATAFORMA.md`](MANUAL_PLATAFORMA.md)

## Seções do manual

| Tópico | Seção |
|--------|-------|
| Pronto vs evolução | [§22 — O que está pronto](MANUAL_PLATAFORMA.md#22-o-que-está-pronto-vs-em-evolução) |
| Melhorias pré-Fase 2 | [§44 — Melhorias recomendadas](MANUAL_PLATAFORMA.md#44-melhorias-recomendadas-antes-da-fase-2) |
| Dívidas técnicas | [§41 — Dívidas técnicas](MANUAL_PLATAFORMA.md#41-dívidas-técnicas) |
| Riscos | [§43 — Riscos arquitetônicos](MANUAL_PLATAFORMA.md#43-riscos-arquitetônicos) |
| Pontos de extensão | [§40 — Extensão](MANUAL_PLATAFORMA.md#40-pontos-de-extensão-existentes) |

## Documentos de planejamento

- [`AI_ARCHITECTURE_PLAN.md`](AI_ARCHITECTURE_PLAN.md) — Fase 0–2 IA
- [`AI_PHASE1_REPORT.md`](AI_PHASE1_REPORT.md) — Fase 1 concluída
- [`AI_PHASE2_ARCHITECTURE.md`](AI_PHASE2_ARCHITECTURE.md) — spec Fase 2
- [`AI_PHASE2_REPORT.md`](AI_PHASE2_REPORT.md) — Fase 2 concluída
- [`AI_PHASE3_ARCHITECTURE.md`](AI_PHASE3_ARCHITECTURE.md) — spec Fase 3
- [`AI_PHASE3_REPORT.md`](AI_PHASE3_REPORT.md) — Fase 3 concluída
- [`AI_PHASE4_REPORT.md`](AI_PHASE4_REPORT.md) — Fase 4 concluída
- [`AI_SETUP.md`](AI_SETUP.md) — setup operacional

## Estado atual (pós-Fases 1 e 2)

### Concluído

- Fase 1: orquestrador multi-agente, especialistas, RAG isolado por agente
- Fase 2: Knowledge CMS — domínios, categorias, assets, publicação atômica, backfill
- Fase 3: memória de contato verificada + ferramentas executáveis (4 tools piloto)
- Fase 4: write tools governadas + observabilidade v2 + UI memória/timeline
- Atendimento WA, tickets, chatbot, IA (RAG/handoff/copilot), SaaS, deploy Docker

### Parcial / próximas fases

- Métricas custo dashboard IA
- Providers gemini/anthropic (501)
- Fase 4+ conforme `AI_ARCHITECTURE_PLAN.md`

### Melhorias prioritárias (§44)

1. Expandir `AI_MIGRATION_NAMES`
2. Unificar debounce default IA
3. Remover branding hardcoded nos prompts
4. Playground paridade RAG com inbound
5. Implementar tools piloto

## Regra de atualização

Conclusão de feature ou dívida resolvida → §22, §41, §44 e este arquivo. Ver [`/.documentation-rules.md`](.documentation-rules.md).
