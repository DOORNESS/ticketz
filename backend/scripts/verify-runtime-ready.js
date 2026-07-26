"use strict";
/**
 * Pré-check pós-deploy: módulos críticos + schema de tickets/mídia.
 * Falha com exit != 0 se a API não puder servir tickets sem 500.
 */
require("../dist/bootstrap");

const path = require("path");

const mustRequire = rel => {
  const full = path.join(__dirname, "..", "dist", rel);
  try {
    require(full);
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({
        ok: false,
        step: "require",
        module: rel,
        error: err && err.message
      })
    );
    return false;
  }
};

const criticalModules = [
  "services/StorageService/storageEnv.js",
  "services/StorageService/objectKeyBuilder.js",
  "services/StorageService/storageRetry.js",
  "services/StorageService/StorageConfigService.js",
  "services/StorageService/S3CompatibleStorageAdapter.js",
  "services/StorageService/StorageService.js",
  "services/MediaServices/MediaAccessService.js",
  "models/Ticket.js",
  "models/MessageMediaFile.js"
];

const run = async () => {
  for (const rel of criticalModules) {
    if (!mustRequire(rel)) {
      process.exit(1);
    }
  }

  try {
    require("@aws-sdk/s3-request-presigner");
  } catch (err) {
    console.error(
      JSON.stringify({
        ok: false,
        step: "npm",
        module: "@aws-sdk/s3-request-presigner",
        error: err && err.message
      })
    );
    process.exit(1);
  }

  const sequelize = require("../dist/database").default;
  const schema = process.env.DB_SCHEMA || "ticketz";

  const [rows] = await sequelize.query(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = :schema
      AND (
        (table_name = 'Tickets' AND column_name IN (
          'permanentDeleteRequestedAt',
          'permanentDeleteRequestedBy',
          'permanentDeletedAt',
          'aiCorrelationId',
          'aiProcessingState',
          'aiAssistActive',
          'aiAssistMode'
        ))
        OR (table_name = 'MessageMediaFiles' AND column_name IN (
          'status',
          'expiresAt',
          'retentionExempt'
        ))
      )
    `,
    { replacements: { schema } }
  );

  const found = new Set(
    (rows || []).map(r => `${r.table_name}.${r.column_name}`)
  );
  const required = [
    "Tickets.permanentDeleteRequestedAt",
    "Tickets.permanentDeleteRequestedBy",
    "Tickets.permanentDeletedAt",
    "MessageMediaFiles.status",
    "MessageMediaFiles.expiresAt",
    "MessageMediaFiles.retentionExempt",
    "Tickets.aiCorrelationId",
    "Tickets.aiProcessingState",
    "Tickets.aiAssistActive",
    "Tickets.aiAssistMode"
  ];
  const missing = required.filter(name => !found.has(name));

  if (missing.length) {
    console.error(
      JSON.stringify({
        ok: false,
        step: "schema",
        missing
      })
    );
    process.exit(1);
  }

  // Smoke query — same path that was returning 500 in produção
  await sequelize.query(
    `SELECT id, uuid, "permanentDeleteRequestedAt" FROM "${schema}"."Tickets" LIMIT 1`
  );

  console.log(
    JSON.stringify({
      ok: true,
      modules: criticalModules.length,
      schemaColumns: required.length
    })
  );
  process.exit(0);
};

run().catch(err => {
  console.error(
    JSON.stringify({
      ok: false,
      step: "runtime",
      error: err && err.message
    })
  );
  process.exit(1);
});
