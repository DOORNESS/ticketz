import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    const [extensions] = await queryInterface.sequelize.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'vector'"
    );

    if (!(extensions as unknown[]).length) {
      try {
        await queryInterface.sequelize.query(
          "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;"
        );
      } catch {
        await queryInterface.sequelize.query(
          "CREATE EXTENSION IF NOT EXISTS vector;"
        );
      }
    }

    await queryInterface.createTable("AiAgents", {
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
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "openai"
      },
      textModel: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "gpt-4o-mini"
      },
      visionModel: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "gpt-4o-mini"
      },
      transcriptionModel: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "gpt-4o-mini-transcribe"
      },
      basePrompt: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      temperature: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.3
      },
      maxTokens: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1024
      },
      fallbackQueueId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Queues", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      handoffMessage: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE
      },
      updatedAt: {
        allowNull: false,
        type: DataTypes.DATE
      }
    });

    await queryInterface.createTable("AiAgentQueues", {
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
      aiAgentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "AiAgents", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      queueId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Queues", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      knowledgeBaseId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE
      },
      updatedAt: {
        allowNull: false,
        type: DataTypes.DATE
      }
    });

    await queryInterface.addConstraint("AiAgentQueues", {
      fields: ["aiAgentId", "queueId"],
      type: "unique",
      name: "ai_agent_queues_unique"
    });

    await queryInterface.createTable("KnowledgeBases", {
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
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE
      },
      updatedAt: {
        allowNull: false,
        type: DataTypes.DATE
      }
    });

    await queryInterface.createTable("KnowledgeDocuments", {
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
      knowledgeBaseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "KnowledgeBases", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "text"
      },
      originalFilename: {
        type: DataTypes.STRING,
        allowNull: true
      },
      storageUrl: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "pending"
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE
      },
      updatedAt: {
        allowNull: false,
        type: DataTypes.DATE
      }
    });

    await queryInterface.createTable("KnowledgeChunks", {
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
      knowledgeDocumentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "KnowledgeDocuments", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE
      }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE "KnowledgeChunks"
      ADD COLUMN embedding vector(1536);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX knowledge_chunks_embedding_idx
      ON "KnowledgeChunks"
      USING hnsw (embedding vector_cosine_ops);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX knowledge_chunks_company_idx
      ON "KnowledgeChunks" ("companyId");
    `);

    await queryInterface.createTable("AiConversationLogs", {
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
        allowNull: true,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      messageId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      direction: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "inbound"
      },
      userMessage: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      aiResponse: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      usedChunks: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      model: {
        type: DataTypes.STRING,
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
      transferredToHuman: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      error: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE
      }
    });

    await queryInterface.createTable("MessageMediaFiles", {
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
        allowNull: true,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      messageId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      mediaType: {
        type: DataTypes.STRING,
        allowNull: true
      },
      mimeType: {
        type: DataTypes.STRING,
        allowNull: true
      },
      originalFilename: {
        type: DataTypes.STRING,
        allowNull: true
      },
      sizeBytes: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      storageProvider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "backblaze"
      },
      storageKey: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      bucket: {
        type: DataTypes.STRING,
        allowNull: true
      },
      publicUrl: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      hash: {
        type: DataTypes.STRING,
        allowNull: true
      },
      transcriptionText: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      visionSummary: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      uploadedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE
      }
    });

    await queryInterface.addColumn("Tickets", "aiHandoff", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await queryInterface.addColumn("Tickets", "aiAgentId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "AiAgents", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    await queryInterface.addIndex("AiAgents", ["companyId", "active"]);
    await queryInterface.addIndex("KnowledgeBases", ["companyId", "active"]);
    await queryInterface.addIndex("AiConversationLogs", [
      "companyId",
      "createdAt"
    ]);
    await queryInterface.addIndex("MessageMediaFiles", [
      "companyId",
      "ticketId"
    ]);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "aiAgentId");
    await queryInterface.removeColumn("Tickets", "aiHandoff");
    await queryInterface.dropTable("MessageMediaFiles");
    await queryInterface.dropTable("AiConversationLogs");
    await queryInterface.dropTable("KnowledgeChunks");
    await queryInterface.dropTable("KnowledgeDocuments");
    await queryInterface.dropTable("KnowledgeBases");
    await queryInterface.dropTable("AiAgentQueues");
    await queryInterface.dropTable("AiAgents");
  }
};
