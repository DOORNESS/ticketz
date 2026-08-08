import { DataTypes, QueryInterface } from "sequelize";

/**
 * Recria `AiKnowledgeSuggestions` onde ela nunca chegou a existir.
 *
 * O buraco: `ApplyAiSchemaService.applyAiSchema()` monta o schema de IA à mão
 * no boot e, ao terminar, MARCA como executadas as migrations equivalentes —
 * entre elas `20260710120000-add-ai-professional-features` (que cria esta
 * tabela) e `20260711120000-ai-gen2-intelligence` (que acrescenta as colunas
 * abaixo). Só que `applyAiSchema` nunca criou esta tabela.
 *
 * O efeito é pior do que uma migration que falha: as duas ficam registradas
 * como aplicadas, `db:migrate:status` mostra tudo em dia e a tabela
 * simplesmente não existe. Em produção isso derrubou o botão "Ensinar IA" com
 * `relation "ticketz.AiKnowledgeSuggestions" does not exist` — sem qualquer
 * sinal no status das migrations.
 *
 * Esta migration é reparo: cria a tabela apenas se faltar, com as colunas das
 * DUAS migrations originais, e não toca em nada quando ela já existe. Bancos
 * saudáveis passam por aqui sem alteração.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const [rows] = (await queryInterface.sequelize.query(
      `SELECT to_regclass(:qualified) AS exists`,
      {
        replacements: {
          qualified: `${
            process.env.DB_SCHEMA || "ticketz"
          }."AiKnowledgeSuggestions"`
        }
      }
    )) as unknown as [{ exists: string | null }[], unknown];

    if (rows?.[0]?.exists) {
      return;
    }

    await queryInterface.createTable("AiKnowledgeSuggestions", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      // Nullable de propósito, ao contrário da migration original: o fluxo de
      // anexar resposta grava `ticketId || null`, e a versão NOT NULL quebrava
      // exatamente o caso de uso principal.
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      suggestedTitle: { type: DataTypes.STRING(255), allowNull: false },
      suggestedContent: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "pending"
      },
      knowledgeBaseId: { type: DataTypes.INTEGER, allowNull: true },
      documentId: { type: DataTypes.INTEGER, allowNull: true },

      // Colunas de 20260711120000-ai-gen2-intelligence
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
      rejectedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      customerName: { type: DataTypes.STRING(255), allowNull: true },
      queueName: { type: DataTypes.STRING(255), allowNull: true },

      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("AiKnowledgeSuggestions", {
      fields: ["companyId", "status"],
      name: "ai_knowledge_suggestions_company_status_idx"
    });
  },

  /**
   * Sem `down`: esta migration só repara ausência. Derrubar a tabela levaria
   * junto as respostas ensinadas pelos supervisores, e o estado "correto"
   * anterior era justamente o defeito.
   */
  down: async () => undefined
};
