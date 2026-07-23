import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("MessageMediaFiles", "status", {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "available"
    });

    await queryInterface.addColumn("MessageMediaFiles", "expiresAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await queryInterface.addColumn("MessageMediaFiles", "deletedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await queryInterface.addColumn("MessageMediaFiles", "deleteRequestedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await queryInterface.addColumn("MessageMediaFiles", "deleteAttempts", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await queryInterface.addColumn("MessageMediaFiles", "lastDeleteError", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn("MessageMediaFiles", "retentionExempt", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await queryInterface.addColumn("MessageMediaFiles", "contactId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Contacts", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    await queryInterface.addColumn("MessageMediaFiles", "metadata", {
      type: DataTypes.JSONB,
      allowNull: true
    });

    await queryInterface.addIndex("MessageMediaFiles", ["companyId", "status"], {
      name: "message_media_files_company_status_idx"
    });

    await queryInterface.addIndex(
      "MessageMediaFiles",
      ["status", "expiresAt"],
      {
        name: "message_media_files_status_expires_idx"
      }
    );

    await queryInterface.addIndex("MessageMediaFiles", ["ticketId", "status"], {
      name: "message_media_files_ticket_status_idx"
    });

    await queryInterface.createTable("MediaDeletionAudits", {
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
        allowNull: true
      },
      requestedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      operation: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      messageCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      mediaCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      bytesRemoved: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "pending"
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

    await queryInterface.addIndex("MediaDeletionAudits", ["companyId", "ticketId"], {
      name: "media_deletion_audits_company_ticket_idx"
    });

    await queryInterface.addColumn("Tickets", "permanentDeleteRequestedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await queryInterface.addColumn("Tickets", "permanentDeleteRequestedBy", {
      type: DataTypes.INTEGER,
      allowNull: true
    });

    await queryInterface.addColumn("Tickets", "permanentDeletedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "permanentDeletedAt");
    await queryInterface.removeColumn("Tickets", "permanentDeleteRequestedBy");
    await queryInterface.removeColumn("Tickets", "permanentDeleteRequestedAt");
    await queryInterface.dropTable("MediaDeletionAudits");
    await queryInterface.removeIndex(
      "MessageMediaFiles",
      "message_media_files_ticket_status_idx"
    );
    await queryInterface.removeIndex(
      "MessageMediaFiles",
      "message_media_files_status_expires_idx"
    );
    await queryInterface.removeIndex(
      "MessageMediaFiles",
      "message_media_files_company_status_idx"
    );
    await queryInterface.removeColumn("MessageMediaFiles", "metadata");
    await queryInterface.removeColumn("MessageMediaFiles", "contactId");
    await queryInterface.removeColumn("MessageMediaFiles", "retentionExempt");
    await queryInterface.removeColumn("MessageMediaFiles", "lastDeleteError");
    await queryInterface.removeColumn("MessageMediaFiles", "deleteAttempts");
    await queryInterface.removeColumn("MessageMediaFiles", "deleteRequestedAt");
    await queryInterface.removeColumn("MessageMediaFiles", "deletedAt");
    await queryInterface.removeColumn("MessageMediaFiles", "expiresAt");
    await queryInterface.removeColumn("MessageMediaFiles", "status");
  }
};
