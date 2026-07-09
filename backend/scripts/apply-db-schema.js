"use strict";
/**
 * Aplica colunas/tabelas AI faltantes no banco de produção (ops/VPS).
 *   node scripts/apply-db-schema.js
 */
require("../dist/bootstrap");
require("../dist/database");

const {
  applyAiSchema
} = require("../dist/services/MigrationServices/ApplyAiSchemaService");

applyAiSchema()
  .then(() => {
    console.log(JSON.stringify({ ok: true, message: "schema applied" }));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
