import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE EXTENSION IF NOT EXISTS unaccent;

      CREATE INDEX IF NOT EXISTS tags_name_unaccent_lower_index
      ON "Tags" (ticketz.immutable_unaccent(LOWER("name")));
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX tags_name_unaccent_lower_index;
    `);
  }
};
