import { DataTypes, QueryInterface } from "sequelize";

/**
 * Completa colunas que faltaram ao recriar `AiKnowledgeSuggestions`.
 *
 * A migration de reparo anterior (20260821100000) recriou a tabela lendo as
 * duas migrations originais, e ao transcrever eu troquei `rejectionReason` por
 * `rejectedByUserId` — uma coluna que o model nem declara. Resultado: a tela de
 * Aprendizados quebrava com
 * `column AiKnowledgeSuggestion.rejectionReason does not exist`, porque o
 * Sequelize monta o SELECT a partir do model.
 *
 * Em vez de assumir de novo qual coluna falta, esta migration compara o que
 * existe no banco com o que o model precisa e cria só a diferença. Bancos que
 * nunca perderam a tabela passam por aqui sem alteração.
 *
 * `rejectedByUserId` fica onde está: é coluna a mais, sempre nula, e derrubá-la
 * não conserta nada — só adiciona risco a uma migration cujo objetivo é
 * justamente reparar.
 */
const REQUIRED_COLUMNS: Record<string, object> = {
  rejectionReason: { type: DataTypes.TEXT, allowNull: true },
  actionType: { type: DataTypes.STRING(32), allowNull: true },
  mainQuestion: { type: DataTypes.TEXT, allowNull: true },
  organizedAnswer: { type: DataTypes.TEXT, allowNull: true },
  keywords: { type: DataTypes.JSONB, allowNull: true },
  category: { type: DataTypes.STRING(128), allowNull: true },
  summary: { type: DataTypes.TEXT, allowNull: true },
  similarDocuments: { type: DataTypes.JSONB, allowNull: true },
  suggestedUpdate: { type: DataTypes.TEXT, allowNull: true },
  selectedDocumentId: { type: DataTypes.INTEGER, allowNull: true },
  confidence: { type: DataTypes.FLOAT, allowNull: true },
  conversationSummary: { type: DataTypes.TEXT, allowNull: true },
  transcript: { type: DataTypes.TEXT, allowNull: true },
  agentUserId: { type: DataTypes.INTEGER, allowNull: true },
  approvedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  rejectedAt: { type: DataTypes.DATE, allowNull: true },
  customerName: { type: DataTypes.STRING(255), allowNull: true },
  queueName: { type: DataTypes.STRING(255), allowNull: true }
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const schema = process.env.DB_SCHEMA || "ticketz";

    const [rows] = (await queryInterface.sequelize.query(
      `SELECT to_regclass(:qualified) AS exists`,
      { replacements: { qualified: `${schema}."AiKnowledgeSuggestions"` } }
    )) as unknown as [{ exists: string | null }[], unknown];

    if (!rows?.[0]?.exists) {
      return;
    }

    const [existing] = (await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = :schema AND table_name = 'AiKnowledgeSuggestions'`,
      { replacements: { schema } }
    )) as unknown as [{ column_name: string }[], unknown];

    const present = new Set((existing || []).map(row => row.column_name));

    // eslint-disable-next-line no-restricted-syntax
    for (const [column, definition] of Object.entries(REQUIRED_COLUMNS)) {
      if (!present.has(column)) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.addColumn(
          "AiKnowledgeSuggestions",
          column,
          definition as never
        );
      }
    }
  },

  /** Sem `down`: remover colunas de reparo levaria dados junto. */
  down: async () => undefined
};
