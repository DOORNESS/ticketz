import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const schema = process.env.DB_SCHEMA || "ticketz";

    await queryInterface.addColumn(
      { tableName: "Tickets", schema },
      "aiHandoffReason",
      {
        type: DataTypes.STRING(64),
        allowNull: true
      }
    );

    await queryInterface.addColumn(
      { tableName: "Tickets", schema },
      "aiPaused",
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }
    );

    await queryInterface.addColumn(
      { tableName: "Tickets", schema },
      "aiResolvedByAi",
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }
    );

    await queryInterface.addColumn(
      { tableName: "Tickets", schema },
      "aiHandoffAt",
      {
        type: DataTypes.DATE,
        allowNull: true
      }
    );

    await queryInterface.addColumn(
      { tableName: "Tickets", schema },
      "aiWaitingSince",
      {
        type: DataTypes.DATE,
        allowNull: true
      }
    );

    await queryInterface.addColumn(
      { tableName: "Tickets", schema },
      "aiStartedAt",
      {
        type: DataTypes.DATE,
        allowNull: true
      }
    );

    await queryInterface.addColumn(
      { tableName: "Tickets", schema },
      "aiSlaBreached",
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }
    );

    await queryInterface.addColumn(
      { tableName: "Queues", schema },
      "slaSeconds",
      {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    );

    await queryInterface.addColumn(
      { tableName: "Queues", schema },
      "slaSupervisorEscalationSeconds",
      {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    );
  },

  down: async (queryInterface: QueryInterface) => {
    const schema = process.env.DB_SCHEMA || "ticketz";

    await queryInterface.removeColumn(
      { tableName: "Tickets", schema },
      "aiHandoffReason"
    );
    await queryInterface.removeColumn(
      { tableName: "Tickets", schema },
      "aiPaused"
    );
    await queryInterface.removeColumn(
      { tableName: "Tickets", schema },
      "aiResolvedByAi"
    );
    await queryInterface.removeColumn(
      { tableName: "Tickets", schema },
      "aiHandoffAt"
    );
    await queryInterface.removeColumn(
      { tableName: "Tickets", schema },
      "aiWaitingSince"
    );
    await queryInterface.removeColumn(
      { tableName: "Tickets", schema },
      "aiStartedAt"
    );
    await queryInterface.removeColumn(
      { tableName: "Tickets", schema },
      "aiSlaBreached"
    );
    await queryInterface.removeColumn(
      { tableName: "Queues", schema },
      "slaSeconds"
    );
    await queryInterface.removeColumn(
      { tableName: "Queues", schema },
      "slaSupervisorEscalationSeconds"
    );
  }
};
