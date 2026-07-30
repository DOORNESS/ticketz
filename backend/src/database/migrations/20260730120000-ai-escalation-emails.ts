import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AiEscalationEmails", {
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
      requestedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "pending"
      },
      requestNotes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      humanGuidance: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      emailTo: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      emailSubject: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      resendMessageId: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      resolvedByEmail: {
        type: DataTypes.STRING(255),
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
      "AiEscalationEmails",
      ["companyId", "ticketId", "createdAt"],
      { name: "ai_escalation_emails_company_ticket_created" }
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiEscalationEmails");
  }
};
