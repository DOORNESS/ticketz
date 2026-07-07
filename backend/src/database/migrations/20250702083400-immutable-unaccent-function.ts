import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION ticketz.immutable_unaccent(text)
      RETURNS text AS $$
      SELECT ticketz.unaccent($1);
      $$ LANGUAGE sql IMMUTABLE;
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS ticketz.immutable_unaccent(text);
    `);
  }
};
