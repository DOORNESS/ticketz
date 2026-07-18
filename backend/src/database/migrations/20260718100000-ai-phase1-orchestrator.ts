import { QueryInterface, DataTypes } from "sequelize";

const ORCHESTRATOR_INDEX = "ai_agents_one_active_orchestrator_per_company";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("AiAgents", "role", {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "legacy"
    });

    await queryInterface.addColumn("AiAgents", "specialty", {
      type: DataTypes.STRING(64),
      allowNull: true
    });

    await queryInterface.addColumn("AiAgents", "routingDescription", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn("AiAgents", "routingKeywords", {
      type: DataTypes.JSONB,
      allowNull: true
    });

    await queryInterface.addColumn("AiAgents", "priority", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100
    });

    await queryInterface.sequelize.query(`
      UPDATE "AiAgents"
      SET role = 'legacy'
      WHERE role IS NULL OR role = '';
    `);

    await queryInterface.createTable("AiAgentKnowledgeBases", {
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
      knowledgeBaseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "KnowledgeBases", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100
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

    await queryInterface.addIndex("AiAgentKnowledgeBases", {
      fields: ["companyId", "aiAgentId", "knowledgeBaseId"],
      unique: true,
      name: "ai_agent_kb_company_agent_base_unique"
    });

    await queryInterface.addIndex("AiAgentKnowledgeBases", {
      fields: ["companyId", "aiAgentId"],
      name: "ai_agent_kb_company_agent_idx"
    });

    await queryInterface.createTable("AiRoutingLogs", {
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
      userMessageSummary: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      orchestratorModel: {
        type: DataTypes.STRING,
        allowNull: true
      },
      selectedAgentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "AiAgents", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      selectedSpecialty: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      confidence: {
        type: DataTypes.FLOAT,
        allowNull: true
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      candidates: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      fallbackUsed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      rerouted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      latencyMs: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex("AiRoutingLogs", {
      fields: ["companyId", "createdAt"],
      name: "ai_routing_logs_company_created_idx"
    });

    await queryInterface.addIndex("AiRoutingLogs", {
      fields: ["companyId", "ticketId"],
      name: "ai_routing_logs_company_ticket_idx"
    });

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX ${ORCHESTRATOR_INDEX}
      ON "AiAgents" ("companyId")
      WHERE role = 'orchestrator' AND active = true;
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS ${ORCHESTRATOR_INDEX};`
    );
    await queryInterface.removeIndex(
      "AiRoutingLogs",
      "ai_routing_logs_company_ticket_idx"
    );
    await queryInterface.removeIndex(
      "AiRoutingLogs",
      "ai_routing_logs_company_created_idx"
    );
    await queryInterface.removeIndex(
      "AiAgentKnowledgeBases",
      "ai_agent_kb_company_agent_idx"
    );
    await queryInterface.removeIndex(
      "AiAgentKnowledgeBases",
      "ai_agent_kb_company_agent_base_unique"
    );
    await queryInterface.dropTable("AiRoutingLogs");
    await queryInterface.dropTable("AiAgentKnowledgeBases");
    await queryInterface.removeColumn("AiAgents", "priority");
    await queryInterface.removeColumn("AiAgents", "routingKeywords");
    await queryInterface.removeColumn("AiAgents", "routingDescription");
    await queryInterface.removeColumn("AiAgents", "specialty");
    await queryInterface.removeColumn("AiAgents", "role");
  }
};
