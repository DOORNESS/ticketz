import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "aiHandoffMode", {
      type: DataTypes.STRING(32),
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiHandoffOriginalReason", {
      type: DataTypes.STRING(64),
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiCaseCompleteness", {
      type: DataTypes.JSONB,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiInvestigationRound", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn("Tickets", "aiCorrelationId", {
      type: DataTypes.STRING(64),
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiProcessingState", {
      type: DataTypes.STRING(32),
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiSkipLegacyOutOfHoursOnHandoff", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn("Tickets", "aiAssistActive", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn("Tickets", "aiAssistMode", {
      type: DataTypes.STRING(32),
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiAssistRequestedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiAssistRequestedBy", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiAssistAgentId", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiHumanAssumedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiHumanAssumedBy", {
      type: DataTypes.INTEGER,
      allowNull: true
    });

    await queryInterface.addColumn("Messages", "transcriptionStatus", {
      type: DataTypes.STRING(32),
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "transcriptionText", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "transcriptionRequestedBy", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "transcriptionReason", {
      type: DataTypes.STRING(64),
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "aiProcessedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "aiReadAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await queryInterface.createTable("AiTicketTimelineEvents", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER
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
      eventType: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      stage: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      operation: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      correlationId: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      messageId: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      agentId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      errorClass: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      details: {
        type: DataTypes.JSONB,
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

    await queryInterface.addIndex("AiTicketTimelineEvents", [
      "companyId",
      "ticketId",
      "createdAt"
    ]);
    await queryInterface.addIndex("AiTicketTimelineEvents", ["correlationId"]);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiTicketTimelineEvents");

    const messageColumns = [
      "transcriptionStatus",
      "transcriptionText",
      "transcriptionRequestedBy",
      "transcriptionReason",
      "aiProcessedAt",
      "aiReadAt"
    ];
    for (const column of messageColumns) {
      await queryInterface.removeColumn("Messages", column);
    }

    const ticketColumns = [
      "aiHandoffMode",
      "aiHandoffOriginalReason",
      "aiCaseCompleteness",
      "aiInvestigationRound",
      "aiCorrelationId",
      "aiProcessingState",
      "aiSkipLegacyOutOfHoursOnHandoff",
      "aiAssistActive",
      "aiAssistMode",
      "aiAssistRequestedAt",
      "aiAssistRequestedBy",
      "aiAssistAgentId",
      "aiHumanAssumedAt",
      "aiHumanAssumedBy"
    ];
    for (const column of ticketColumns) {
      await queryInterface.removeColumn("Tickets", column);
    }
  }
};
