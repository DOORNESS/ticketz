import { QueryInterface, DataTypes } from "sequelize";

const DEFAULT_CATEGORIES = [
  { slug: "links", name: "Links", icon: "link", sortOrder: 10 },
  { slug: "images", name: "Imagens", icon: "image", sortOrder: 20 },
  { slug: "pdfs", name: "PDFs", icon: "pdf", sortOrder: 30 },
  { slug: "documents", name: "Documentos", icon: "document", sortOrder: 40 },
  { slug: "audios", name: "Áudios", icon: "audio", sortOrder: 50 },
  { slug: "videos", name: "Vídeos", icon: "video", sortOrder: 60 },
  { slug: "texts", name: "Textos prontos", icon: "text", sortOrder: 70 },
  { slug: "templates", name: "Modelos", icon: "template", sortOrder: 80 },
  { slug: "internal", name: "Materiais internos", icon: "internal", sortOrder: 90 },
  { slug: "other", name: "Outros", icon: "other", sortOrder: 100 }
];

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("ContentRepositoryCategories", {
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
      slug: { type: DataTypes.STRING(64), allowNull: false },
      name: { type: DataTypes.STRING(128), allowNull: false },
      icon: { type: DataTypes.STRING(32), allowNull: true },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      allowAiUse: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      queueIds: { type: DataTypes.JSONB, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("ContentRepositoryCategories", {
      fields: ["companyId", "slug"],
      unique: true,
      name: "content_repo_category_company_slug"
    });

    await queryInterface.createTable("ContentRepositoryUsageLogs", {
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
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      channel: { type: DataTypes.STRING(32), allowNull: true },
      source: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "human"
      },
      aiAgentId: { type: DataTypes.INTEGER, allowNull: true },
      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      errorCode: { type: DataTypes.STRING(64), allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("ContentRepositoryUsageLogs", {
      fields: ["companyId", "userId", "createdAt"],
      name: "content_repo_usage_user_recent"
    });

    await queryInterface.addIndex("ContentRepositoryUsageLogs", {
      fields: ["companyId", "repositoryItemId", "createdAt"],
      name: "content_repo_usage_item"
    });

    await queryInterface.createTable("ContentRepositoryPermissions", {
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
      principalType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "profile"
      },
      principalId: { type: DataTypes.STRING(64), allowNull: false },
      permission: { type: DataTypes.STRING(32), allowNull: false },
      resourceType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "repository"
      },
      resourceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("ContentRepositoryPermissions", {
      fields: ["companyId", "principalType", "principalId", "permission"],
      name: "content_repo_perm_lookup"
    });

    await queryInterface.addColumn("ContentRepositoryItems", "categoryId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "ContentRepositoryCategories", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    const [companies] = (await queryInterface.sequelize.query(
      'SELECT id FROM "Companies"'
    )) as [{ id: number }[], unknown];

    const now = new Date();
    for (const company of companies || []) {
      for (const cat of DEFAULT_CATEGORIES) {
        await queryInterface.bulkInsert("ContentRepositoryCategories", [
          {
            companyId: company.id,
            slug: cat.slug,
            name: cat.name,
            icon: cat.icon,
            sortOrder: cat.sortOrder,
            active: true,
            allowAiUse: cat.slug !== "internal",
            createdAt: now,
            updatedAt: now
          }
        ]);
      }

      await queryInterface.bulkInsert("ContentRepositoryPermissions", [
        {
          companyId: company.id,
          principalType: "profile",
          principalId: "admin",
          permission: "admin",
          resourceType: "repository",
          resourceId: 0,
          active: true,
          createdAt: now,
          updatedAt: now
        },
        {
          companyId: company.id,
          principalType: "profile",
          principalId: "user",
          permission: "read",
          resourceType: "repository",
          resourceId: 0,
          active: true,
          createdAt: now,
          updatedAt: now
        },
        {
          companyId: company.id,
          principalType: "profile",
          principalId: "user",
          permission: "send",
          resourceType: "repository",
          resourceId: 0,
          active: true,
          createdAt: now,
          updatedAt: now
        }
      ]);
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("ContentRepositoryItems", "categoryId");
    await queryInterface.dropTable("ContentRepositoryPermissions");
    await queryInterface.dropTable("ContentRepositoryUsageLogs");
    await queryInterface.dropTable("ContentRepositoryCategories");
  }
};
