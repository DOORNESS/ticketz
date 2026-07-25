"use strict";
/**
 * Pré-check pós-deploy: garante que rotas pesadas (tickets, IA, CMS) carregam.
 * Falha se aiRoutes referencia handlers ausentes no dist (patch incompleto).
 */
require("../dist/bootstrap");

const path = require("path");

const fail = (step, detail) => {
  console.error(JSON.stringify({ ok: false, step, ...detail }));
  process.exit(1);
};

const mustExport = (rel, exports) => {
  const full = path.join(__dirname, "..", "dist", rel);
  let mod;
  try {
    mod = require(full);
  } catch (err) {
    fail("require", { module: rel, error: err && err.message });
  }

  const missing = exports.filter(name => typeof mod[name] !== "function");
  if (missing.length) {
    fail("export", { module: rel, missing });
  }
};

const run = async () => {
  mustExport("controllers/KnowledgeAssetController.js", [
    "index",
    "storeUpload",
    "storeText",
    "storeUrl",
    "cloneToBase",
    "quickPublish"
  ]);

  mustExport("controllers/KnowledgeBaseController.js", ["index"]);

  try {
    await import(path.join(__dirname, "..", "dist", "routes", "heavyRoutes.js"));
  } catch (err) {
    fail("heavyRoutes", { error: err && err.message });
  }

  console.log(JSON.stringify({ ok: true, heavyRoutes: "loadable" }));
  process.exit(0);
};

run().catch(err => {
  fail("runtime", { error: err && err.message });
});
