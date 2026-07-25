# RAG (Retrieval-Augmented Generation)

Índice temático. **Conteúdo completo:** [`MANUAL_PLATAFORMA.md`](MANUAL_PLATAFORMA.md)

## Seções do manual

| Tópico | Seção |
|--------|-------|
| Fluxo RAG | [§28 — Fluxo RAG](MANUAL_PLATAFORMA.md#28-fluxo-rag) |
| Upload e indexação | [§29 — Upload e indexação](MANUAL_PLATAFORMA.md#29-fluxo-upload-e-indexação-de-documentos) |
| Tabelas KB | [§33 — Banco IA](MANUAL_PLATAFORMA.md#33-banco-de-dados--módulo-ia) |
| Relacionamentos | [§34 — Relação tabelas IA](MANUAL_PLATAFORMA.md#34-relação-entre-tabelas-ia) |

## Serviços no código

| Serviço | Arquivo |
|---------|---------|
| Busca vetorial + keyword | `AiServices/RetrievalEngine.ts` |
| Política RAG CMS vs legado | `KnowledgeCms/KnowledgeRetrievalPolicy.ts` |
| CMS publish / swap | `KnowledgeCms/KnowledgeAtomicSwapService.ts` |
| Contexto para prompt | `AiServices/KnowledgeContextService.ts` |
| Ingestão documentos | `AiServices/IngestKnowledgeDocumentService.ts` |
| Chunking | `AiServices/ChunkingService.ts` |
| Parsing PDF/DOCX/TXT | `AiServices/DocumentParser.ts` |
| Embeddings | `AiServices/ModelGateway.ts` → `OpenAIProvider.ts` |

## Parâmetros verificados

- Modelo embedding: `text-embedding-3-small`
- Dimensão vector: 1536 (pgvector)
- Threshold confiável inbound: similarity ≥ 0.25
- CMS ON: apenas chunks de versões **publicadas** e **indexadas** (`KnowledgeRetrievalPolicy`)
- UI admin: `/ai/assets` — upload, texto, URL de site, clone entre bases, publicação rápida (ver §29 manual)

## Scripts operacionais (pós-migration Fase 2)

```bash
COMPANY_ID=<id> npm run backfill:knowledge-assets
COMPANY_ID=<id> npm run validate:knowledge-assets
```

## Regra de atualização

Alterações em RAG exigem §28, §29, §33–§34. Ver [`/.documentation-rules.md`](.documentation-rules.md).
