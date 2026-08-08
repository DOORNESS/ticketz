import { QueryInterface, DataTypes } from "sequelize";

/**
 * Fundação multimarca.
 *
 * `Brand` é entidade própria, e não uma evolução de `KnowledgeDomain`.
 * Os dois conceitos têm ciclos de vida diferentes: domínio é taxonomia
 * editorial do CMS (agrupa bases, tem `linkedSpecialty` e ordenação de
 * listagem), enquanto marca é unidade operacional (possui conexões, filas,
 * agentes, tema, contatos e permissões). Fundir os dois impediria uma marca
 * de ter mais de um domínio — exatamente o caso da Nível, que já opera com
 * "Nivel site clientes" e "Nivel empresa". A relação correta é Brand 1—N
 * KnowledgeDomain, e é ela que esta migration cria.
 *
 * Todas as FKs de marca nascem `allowNull: true`: a coluna é adicionada antes
 * do backfill e o fluxo legado continua funcionando enquanto ela estiver
 * vazia. Nada aqui derruba Nível ou Fortmax.
 */
export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("Brands", {
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
      slug: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      logoUrl: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      primaryColor: {
        type: DataTypes.STRING(32),
        allowNull: true
      },
      shortLabel: {
        type: DataTypes.STRING(24),
        allowNull: true
      },
      // Persona: substitui detectAgentBrand + buildAgentIdentityReply
      identityName: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      identityReply: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Conteúdo de negócio que hoje está compilado no código
      escalationUrl: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      informationalFallback: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      supportContacts: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      },
      // Termos que marcam o domínio desta marca — substitui os regex
      // /nivel/, /cashback/ dentro de classificadores compartilhados.
      vocabulary: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      },
      settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    await queryInterface.addIndex("Brands", {
      fields: ["companyId", "slug"],
      unique: true,
      name: "brands_company_slug_unique"
    });
    await queryInterface.addIndex("Brands", {
      fields: ["companyId", "active"],
      name: "brands_company_active_idx"
    });

    /**
     * Permissão por marca, N:N e sem duplicar login.
     *
     * `canAttend` separa supervisionar de atender: um supervisor pode
     * acompanhar duas operações sem assumir ticket em nenhuma delas.
     * Ausência de linha = sem acesso à marca.
     */
    await queryInterface.createTable("UserBrands", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      brandId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Brands", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      canAttend: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    await queryInterface.addIndex("UserBrands", {
      fields: ["userId", "brandId"],
      unique: true,
      name: "user_brands_user_brand_unique"
    });
    await queryInterface.addIndex("UserBrands", {
      fields: ["brandId"],
      name: "user_brands_brand_idx"
    });

    const addBrandColumn = async (table: string) => {
      await queryInterface.addColumn(table, "brandId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Brands", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      });
    };

    // Origem do atendimento: a conexão é quem define a marca.
    await addBrandColumn("Whatsapps");
    await addBrandColumn("Queues");
    await addBrandColumn("AiAgents");
    await addBrandColumn("KnowledgeDomains");
    await addBrandColumn("KnowledgeBases");

    /**
     * `Tickets.brandId` preserva a identidade histórica do atendimento.
     * Depois de gravado, não é derivado de novo: trocar a conexão, a fila ou
     * o agente do ticket não reescreve a marca de origem.
     */
    await addBrandColumn("Tickets");

    await queryInterface.addIndex("Tickets", {
      fields: ["companyId", "brandId", "status"],
      name: "tickets_company_brand_status_idx"
    });
    await queryInterface.addIndex("Whatsapps", {
      fields: ["brandId"],
      name: "whatsapps_brand_idx"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("Whatsapps", "whatsapps_brand_idx");
    await queryInterface.removeIndex(
      "Tickets",
      "tickets_company_brand_status_idx"
    );

    await queryInterface.removeColumn("Tickets", "brandId");
    await queryInterface.removeColumn("KnowledgeBases", "brandId");
    await queryInterface.removeColumn("KnowledgeDomains", "brandId");
    await queryInterface.removeColumn("AiAgents", "brandId");
    await queryInterface.removeColumn("Queues", "brandId");
    await queryInterface.removeColumn("Whatsapps", "brandId");

    await queryInterface.dropTable("UserBrands");
    await queryInterface.dropTable("Brands");
  }
};
