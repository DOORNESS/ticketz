import { QueryInterface } from "sequelize";

/**
 * Fecha as FKs que `20260719180000-content-repository` não conseguiu declarar.
 *
 * Aquela migration referencia `KnowledgeDomains` e `KnowledgeAssets`, criadas
 * só por `20260725100000-ai-phase2-knowledge-cms` — timestamp posterior. Em
 * banco vazio a cadeia abortava ali. Agora ela cria as colunas sem constraint
 * quando as tabelas ainda não existem, e esta migration adiciona as
 * constraints depois, na ordem certa.
 *
 * Comportamento por ambiente:
 *
 * - **Banco existente** (produção, homologação já criada): as FKs foram
 *   criadas quando a migration original rodou na ordem cronológica real.
 *   Cada bloco abaixo verifica antes de agir, então aqui é no-op — nenhuma
 *   constraint recriada, nenhum lock desnecessário.
 * - **Banco novo**: as constraints são criadas agora.
 *
 * Idempotente de propósito: é a única forma de a mesma migration ser segura
 * nos dois cenários sem depender de qual deles está rodando.
 */

type ExistsRow = { exists: boolean };

const tableExists = async (
  queryInterface: QueryInterface,
  table: string
): Promise<boolean> => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT to_regclass(:qualified) IS NOT NULL AS "exists"`,
    { replacements: { qualified: `"${table}"` } }
  );
  return Boolean((rows as ExistsRow[])[0]?.exists);
};

const constraintExists = async (
  queryInterface: QueryInterface,
  table: string,
  constraint: string
): Promise<boolean> => {
  const [rows] = await queryInterface.sequelize.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = :table
        AND c.conname = :constraint
    ) AS "exists"
    `,
    { replacements: { table, constraint } }
  );
  return Boolean((rows as ExistsRow[])[0]?.exists);
};

/** Já existe alguma FK nesta coluna, com qualquer nome? */
const columnHasForeignKey = async (
  queryInterface: QueryInterface,
  table: string,
  column: string
): Promise<boolean> => {
  const [rows] = await queryInterface.sequelize.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_attribute a
        ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
      WHERE t.relname = :table
        AND a.attname = :column
        AND c.contype = 'f'
    ) AS "exists"
    `,
    { replacements: { table, column } }
  );
  return Boolean((rows as ExistsRow[])[0]?.exists);
};

const DEFERRED_FKS = [
  {
    column: "knowledgeDomainId",
    target: "KnowledgeDomains",
    constraint: "content_repository_items_knowledge_domain_fk"
  },
  {
    column: "knowledgeAssetId",
    target: "KnowledgeAssets",
    constraint: "content_repository_items_knowledge_asset_fk"
  }
];

const TABLE = "ContentRepositoryItems";

export default {
  up: async (queryInterface: QueryInterface) => {
    if (!(await tableExists(queryInterface, TABLE))) {
      return;
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const fk of DEFERRED_FKS) {
      const targetReady = await tableExists(queryInterface, fk.target);
      if (!targetReady) {
        continue;
      }

      const alreadyLinked = await columnHasForeignKey(
        queryInterface,
        TABLE,
        fk.column
      );
      if (alreadyLinked) {
        continue;
      }

      await queryInterface.addConstraint(TABLE, {
        fields: [fk.column],
        type: "foreign key",
        name: fk.constraint,
        references: { table: fk.target, field: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    if (!(await tableExists(queryInterface, TABLE))) {
      return;
    }

    // Remove apenas as constraints que ESTA migration nomeou. As criadas pela
    // migration original têm o nome automático do Sequelize e pertencem a ela.
    // eslint-disable-next-line no-restricted-syntax
    for (const fk of DEFERRED_FKS) {
      if (await constraintExists(queryInterface, TABLE, fk.constraint)) {
        await queryInterface.removeConstraint(TABLE, fk.constraint);
      }
    }
  }
};
