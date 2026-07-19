import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("ContentRepositoryItems", {
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
      name: { type: DataTypes.STRING(255), allowNull: false },
      displayTitle: { type: DataTypes.STRING(255), allowNull: true },
      contentType: { type: DataTypes.STRING(64), allowNull: false },
      category: { type: DataTypes.STRING(128), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      sendCaption: { type: DataTypes.TEXT, allowNull: true },
      storageKey: { type: DataTypes.STRING(512), allowNull: true },
      originalFileName: { type: DataTypes.STRING(512), allowNull: true },
      fileSize: { type: DataTypes.INTEGER, allowNull: true },
      mimeType: { type: DataTypes.STRING(128), allowNull: true },
      thumbnailKey: { type: DataTypes.STRING(512), allowNull: true },
      externalUrl: { type: DataTypes.TEXT, allowNull: true },
      tags: { type: DataTypes.JSONB, allowNull: true },
      knowledgeDomainId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "KnowledgeDomains", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      knowledgeBaseId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "KnowledgeBases", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      knowledgeAssetId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "KnowledgeAssets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      queueIds: { type: DataTypes.JSONB, allowNull: true },
      agentIds: { type: DataTypes.JSONB, allowNull: true },
      aiAgentIds: { type: DataTypes.JSONB, allowNull: true },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      allowAiUse: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      allowHumanUse: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      useForKnowledge: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      useForDelivery: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      visibility: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "company"
      },
      usageCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
      currentVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      checksum: { type: DataTypes.STRING(128), allowNull: true },
      authorUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("ContentRepositoryItems", {
      fields: ["companyId", "active"],
      name: "content_repo_company_active_idx"
    });
    await queryInterface.addIndex("ContentRepositoryItems", {
      fields: ["companyId", "contentType"],
      name: "content_repo_company_type_idx"
    });
    await queryInterface.addIndex("ContentRepositoryItems", {
      fields: ["companyId", "name"],
      name: "content_repo_company_name_idx"
    });

    await queryInterface.createTable("ContentRepositoryItemVersions", {
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
      repositoryItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "ContentRepositoryItems", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      versionNumber: { type: DataTypes.INTEGER, allowNull: false },
      storageKey: { type: DataTypes.STRING(512), allowNull: true },
      originalFileName: { type: DataTypes.STRING(512), allowNull: true },
      fileSize: { type: DataTypes.INTEGER, allowNull: true },
      mimeType: { type: DataTypes.STRING(128), allowNull: true },
      checksum: { type: DataTypes.STRING(128), allowNull: true },
      changeReason: { type: DataTypes.TEXT, allowNull: true },
      authorUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("ContentRepositoryItemVersions", {
      fields: ["repositoryItemId", "versionNumber"],
      unique: true,
      name: "content_repo_version_unique"
    });

    await queryInterface.createTable("ContentRepositoryFavorites", {
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
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      repositoryItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "ContentRepositoryItems", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("ContentRepositoryFavorites", {
      fields: ["userId", "repositoryItemId"],
      unique: true,
      name: "content_repo_favorite_unique"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("ContentRepositoryFavorites");
    await queryInterface.dropTable("ContentRepositoryItemVersions");
    await queryInterface.dropTable("ContentRepositoryItems");
  }
};
