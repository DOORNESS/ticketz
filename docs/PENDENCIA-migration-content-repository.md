# Pendência — `db:migrate` do zero está quebrado

**Status:** aberta · **Descoberta em:** 2026-08-08, durante a validação multimarca
**Não relacionada** à arquitetura de Brands — registrada em separado de propósito.

## Migration envolvida

`backend/src/database/migrations/20260719180000-content-repository.ts`

Introduzida no commit `b48e80b` (`feat(content): repository multimodal, unified ticket panel, audio fix`).

## Causa

A migration cria `ContentRepositoryItems` com uma FK para `KnowledgeDomains`:

```ts
// 20260719180000-content-repository.ts:35
references: { model: "KnowledgeDomains", key: "id" },
```

Mas `KnowledgeDomains` só é criada por `20260725100000-ai-phase2-knowledge-cms` — timestamp **6 dias posterior**. Como o Sequelize executa migrations em ordem de nome, a FK é avaliada antes da tabela existir:

```
== 20260719180000-content-repository: migrating =======
ERROR: relation "KnowledgeDomains" does not exist
```

## Impacto

| Cenário | Afetado |
|---------|---------|
| Produção e homologação atuais | **Não.** As tabelas foram criadas incrementalmente na ordem cronológica real; o `SequelizeMeta` já marca ambas como aplicadas |
| Instalação nova / banco vazio | **Sim.** `npm run db:migrate` aborta e o ambiente não sobe |
| `docker-compose-local.yaml` | **Sim.** O container roda migrations na subida |
| CI com banco efêmero | **Sim** |

Na prática: hoje ninguém consegue montar um ambiente novo do zero sem contornar manualmente.

## Por que não corrigir renomeando

A tentação é renomear a migration para um timestamp posterior a `20260725100000`. **Não faça isso.** O Sequelize identifica migrations aplicadas pelo nome do arquivo em `SequelizeMeta`. Renomear faria produção considerá-la nova e executá-la de novo — `createTable` em tabela existente, erro na subida do backend.

## Caminho seguro

Tornar a FK condicional dentro da própria migration, sem mudar o nome:

```ts
const [rows] = await queryInterface.sequelize.query(
  `SELECT to_regclass('"KnowledgeDomains"') IS NOT NULL AS exists`
);
const knowledgeDomainsExists = (rows as { exists: boolean }[])[0]?.exists;

knowledgeDomainId: {
  type: DataTypes.INTEGER,
  allowNull: true,
  ...(knowledgeDomainsExists
    ? { references: { model: "KnowledgeDomains", key: "id" } }
    : {})
}
```

E adicionar a FK que faltou numa migration **nova**, posterior à de Fase 2, também condicional (só cria a constraint se ainda não existir).

Resultado: ambiente existente não muda (a migration não roda de novo); ambiente novo passa, e a FK é criada depois, na ordem certa.

## Como reproduzir

```bash
createdb ticketz_novo
cd backend && npm run build && npx sequelize db:migrate
# aborta em 20260719180000-content-repository
```

## Contorno usado na validação multimarca

As duas migrations de content-repository foram temporariamente movidas para fora de `dist/database/migrations`, a cadeia rodou até o fim (incluindo Fase 2, que cria `KnowledgeDomains`), e elas foram restauradas e aplicadas em seguida. Serve para validar localmente; **não** é correção.
