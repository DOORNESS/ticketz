import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("AiKnowledgeSuggestions", "actionType", {
      type: DataTypes.STRING(32),
      allowNull: true
    });
    await queryInterface.addColumn("AiKnowledgeSuggestions", "mainQuestion", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn(
      "AiKnowledgeSuggestions",
      "organizedAnswer",
      {
        type: DataTypes.TEXT,
        allowNull: true
      }
    );
    await queryInterface.addColumn("AiKnowledgeSuggestions", "keywords", {
      type: DataTypes.JSONB,
      allowNull: true
    });
    await queryInterface.addColumn("AiKnowledgeSuggestions", "category", {
      type: DataTypes.STRING(128),
      allowNull: true
    });
    await queryInterface.addColumn("AiKnowledgeSuggestions", "summary", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn(
      "AiKnowledgeSuggestions",
      "similarDocuments",
      {
        type: DataTypes.JSONB,
        allowNull: true
      }
    );
    await queryInterface.addColumn(
      "AiKnowledgeSuggestions",
      "suggestedUpdate",
      {
        type: DataTypes.TEXT,
        allowNull: true
      }
    );
    await queryInterface.addColumn(
      "AiKnowledgeSuggestions",
      "selectedDocumentId",
      {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    );
    await queryInterface.addColumn("AiKnowledgeSuggestions", "confidence", {
      type: DataTypes.FLOAT,
      allowNull: true
    });
    await queryInterface.addColumn(
      "AiKnowledgeSuggestions",
      "conversationSummary",
      {
        type: DataTypes.TEXT,
        allowNull: true
      }
    );
    await queryInterface.addColumn("AiKnowledgeSuggestions", "transcript", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("AiKnowledgeSuggestions", "agentUserId", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn(
      "AiKnowledgeSuggestions",
      "approvedByUserId",
      {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    );
    await queryInterface.addColumn("AiKnowledgeSuggestions", "approvedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("AiKnowledgeSuggestions", "rejectedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
    await queryInterface.addColumn(
      "AiKnowledgeSuggestions",
      "rejectionReason",
      {
        type: DataTypes.TEXT,
        allowNull: true
      }
    );
    await queryInterface.addColumn("AiKnowledgeSuggestions", "customerName", {
      type: DataTypes.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn("AiKnowledgeSuggestions", "queueName", {
      type: DataTypes.STRING(128),
      allowNull: true
    });

    await queryInterface.addColumn("AiCopilotSuggestions", "improvedResponse", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("AiCopilotSuggestions", "relatedDocument", {
      type: DataTypes.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn("AiCopilotSuggestions", "nextSteps", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("AiCopilotSuggestions", "riskAssessment", {
      type: DataTypes.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn(
      "AiCopilotSuggestions",
      "customerSentiment",
      {
        type: DataTypes.STRING(64),
        allowNull: true
      }
    );

    await queryInterface.addColumn("Tickets", "aiSlaEscalationLevel", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn("Tickets", "aiLastExplainability", {
      type: DataTypes.JSONB,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiLastSlaAlertAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await queryInterface.createTable("AiReplayLogs", {
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
      messageId: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      userQuestion: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      conversationHistory: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      systemPrompt: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      usedChunks: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      aiResponse: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      confidence: {
        type: DataTypes.FLOAT,
        allowNull: true
      },
      explainability: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      tokensInput: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      tokensOutput: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      latencyMs: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      costUsd: {
        type: DataTypes.DECIMAL(12, 6),
        allowNull: true
      },
      model: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      mediaType: {
        type: DataTypes.STRING(32),
        allowNull: true
      },
      visionSummary: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      ocrText: {
        type: DataTypes.TEXT,
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
    await queryInterface.dropTable("AiReplayLogs");
    await queryInterface.removeColumn("Tickets", "aiLastSlaAlertAt");
    await queryInterface.removeColumn("Tickets", "aiLastExplainability");
    await queryInterface.removeColumn("Tickets", "aiSlaEscalationLevel");
    await queryInterface.removeColumn(
      "AiCopilotSuggestions",
      "customerSentiment"
    );
    await queryInterface.removeColumn("AiCopilotSuggestions", "riskAssessment");
    await queryInterface.removeColumn("AiCopilotSuggestions", "nextSteps");
    await queryInterface.removeColumn(
      "AiCopilotSuggestions",
      "relatedDocument"
    );
    await queryInterface.removeColumn(
      "AiCopilotSuggestions",
      "improvedResponse"
    );
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "queueName");
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "customerName");
    await queryInterface.removeColumn(
      "AiKnowledgeSuggestions",
      "rejectionReason"
    );
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "rejectedAt");
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "approvedAt");
    await queryInterface.removeColumn(
      "AiKnowledgeSuggestions",
      "approvedByUserId"
    );
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "agentUserId");
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "transcript");
    await queryInterface.removeColumn(
      "AiKnowledgeSuggestions",
      "conversationSummary"
    );
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "confidence");
    await queryInterface.removeColumn(
      "AiKnowledgeSuggestions",
      "selectedDocumentId"
    );
    await queryInterface.removeColumn(
      "AiKnowledgeSuggestions",
      "suggestedUpdate"
    );
    await queryInterface.removeColumn(
      "AiKnowledgeSuggestions",
      "similarDocuments"
    );
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "summary");
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "category");
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "keywords");
    await queryInterface.removeColumn(
      "AiKnowledgeSuggestions",
      "organizedAnswer"
    );
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "mainQuestion");
    await queryInterface.removeColumn("AiKnowledgeSuggestions", "actionType");
  }
};
