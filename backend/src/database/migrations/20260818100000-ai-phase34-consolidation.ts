import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AiToolIdempotencyRecords", {
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
      idempotencyKey: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      toolId: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      contactId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      aiAgentId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      correlationId: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      resultSanitized: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      mutationTarget: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      mutationTargetId: {
        type: DataTypes.STRING(64),
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

    await queryInterface.addIndex(
      "AiToolIdempotencyRecords",
      ["companyId", "idempotencyKey"],
      { unique: true, name: "ai_tool_idempotency_company_key_unique" }
    );

    await queryInterface.addColumn("AiToolExecutionLogs", "idempotencyKey", {
      type: DataTypes.STRING(128),
      allowNull: true
    });
    await queryInterface.addColumn("AiToolExecutionLogs", "correlationId", {
      type: DataTypes.STRING(64),
      allowNull: true
    });
    await queryInterface.addColumn("AiToolExecutionLogs", "attempt", {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1
    });
    await queryInterface.addColumn("AiToolExecutionLogs", "reusedResult", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn(
      "AiToolExecutionLogs",
      "previousStateSanitized",
      {
        type: DataTypes.TEXT,
        allowNull: true
      }
    );
    await queryInterface.addColumn("AiToolExecutionLogs", "newStateSanitized", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("AiToolExecutionLogs", "mutationTargetId", {
      type: DataTypes.STRING(64),
      allowNull: true
    });
    await queryInterface.addColumn("AiToolExecutionLogs", "reversible", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn("AiToolExecutionLogs", "executedByAgentId", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn(
      "AiToolExecutionLogs",
      "executedByAgentId"
    );
    await queryInterface.removeColumn("AiToolExecutionLogs", "reversible");
    await queryInterface.removeColumn("AiToolExecutionLogs", "mutationTargetId");
    await queryInterface.removeColumn("AiToolExecutionLogs", "newStateSanitized");
    await queryInterface.removeColumn(
      "AiToolExecutionLogs",
      "previousStateSanitized"
    );
    await queryInterface.removeColumn("AiToolExecutionLogs", "reusedResult");
    await queryInterface.removeColumn("AiToolExecutionLogs", "attempt");
    await queryInterface.removeColumn("AiToolExecutionLogs", "correlationId");
    await queryInterface.removeColumn("AiToolExecutionLogs", "idempotencyKey");
    await queryInterface.dropTable("AiToolIdempotencyRecords");
  }
};
