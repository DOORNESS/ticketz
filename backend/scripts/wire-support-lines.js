"use strict";
/**
 * Wire Fortmax and Nível WhatsApp lines (ops/VPS).
 *   node scripts/wire-support-lines.js
 */
require("../dist/bootstrap");
require("../dist/database");

const {
  wireSupportLinesForCompany
} = require("../dist/services/AiServices/WireSupportLinesService");

const COMPANY_ID = Number(process.env.COMPANY_ID || 1);

wireSupportLinesForCompany(COMPANY_ID)
  .then(summary => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
