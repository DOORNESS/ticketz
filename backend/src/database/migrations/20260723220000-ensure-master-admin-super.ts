import { QueryInterface } from "sequelize";

const MASTER_EMAILS = ["fernandofortmax@gmail.com"];

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    for (const email of MASTER_EMAILS) {
      await queryInterface.sequelize.query(
        `
          UPDATE "Users"
          SET "super" = true,
              "profile" = 'admin',
              "updatedAt" = NOW()
          WHERE LOWER("email") = LOWER(:email)
        `,
        { replacements: { email } }
      );
    }
  },

  down: async (): Promise<void> => {
    // no-op: do not revoke master admin privileges on rollback
  }
};
