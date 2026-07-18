import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AiMetricsSnapshots", {
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
      periodType: {
        type: DataTypes.STRING(16),
        allowNull: false
      },
      periodStart: {
        type: DataTypes.DATE,
        allowNull: false
      },
      metricsJson: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex("AiMetricsSnapshots", [
      "companyId",
      "periodType",
      "periodStart"
    ]);

    await queryInterface.addColumn("AiToolExecutionLogs", "riskLevel", {
      type: DataTypes.STRING(16),
      allowNull: true
    });

    await queryInterface.addColumn("AiToolExecutionLogs", "mutationTarget", {
      type: DataTypes.STRING(128),
      allowNull: true
    });

    await queryInterface.addColumn("MessageMediaFiles", "direction", {
      type: DataTypes.STRING(16),
      allowNull: true,
      defaultValue: "inbound"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("MessageMediaFiles", "direction");
    await queryInterface.removeColumn("AiToolExecutionLogs", "mutationTarget");
    await queryInterface.removeColumn("AiToolExecutionLogs", "riskLevel");
    await queryInterface.dropTable("AiMetricsSnapshots");
  }
};
