import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "KnowledgeChunks"
      ALTER COLUMN "knowledgeDocumentId" DROP NOT NULL;
    `);
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "KnowledgeChunks"
      ALTER COLUMN "knowledgeDocumentId" SET NOT NULL;
    `);
  }
};
