import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "aiHandoffSummary", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiPriority", {
      type: DataTypes.STRING(16),
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiLastConfidence", {
      type: DataTypes.FLOAT,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiEndedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiResponseCount", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn("Tickets", "aiTotalTokensInput", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn("Tickets", "aiTotalTokensOutput", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn("Tickets", "aiEstimatedCostUsd", {
      type: DataTypes.DECIMAL(12, 6),
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn("Tickets", "aiSatisfactionRating", {
      type: DataTypes.SMALLINT,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiSatisfactionSource", {
      type: DataTypes.STRING(32),
      allowNull: true
    });

    await queryInterface.createTable("AiCopilotSuggestions", {
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
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      suggestedResponse: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      rationale: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      usedChunks: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      confidence: {
        type: DataTypes.FLOAT,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "pending"
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

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
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      suggestedTitle: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      suggestedContent: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "pending"
      },
      knowledgeBaseId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      documentId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiKnowledgeSuggestions");
    await queryInterface.dropTable("AiCopilotSuggestions");
    await queryInterface.removeColumn("Tickets", "aiSatisfactionSource");
    await queryInterface.removeColumn("Tickets", "aiSatisfactionRating");
    await queryInterface.removeColumn("Tickets", "aiEstimatedCostUsd");
    await queryInterface.removeColumn("Tickets", "aiTotalTokensOutput");
    await queryInterface.removeColumn("Tickets", "aiTotalTokensInput");
    await queryInterface.removeColumn("Tickets", "aiResponseCount");
    await queryInterface.removeColumn("Tickets", "aiEndedAt");
    await queryInterface.removeColumn("Tickets", "aiLastConfidence");
    await queryInterface.removeColumn("Tickets", "aiPriority");
    await queryInterface.removeColumn("Tickets", "aiHandoffSummary");
  }
};
