"use strict";
/**
 * Reseta sessão WhatsApp no banco (uso ops/VPS).
 *   node scripts/reset-whatsapp-session.js [whatsappId]
 */
require("../dist/bootstrap");
require("../dist/database");

const Whatsapp = require("../dist/models/Whatsapp").default;
const BaileysKeys = require("../dist/models/BaileysKeys").default;

const run = async () => {
  const whatsappId = Number(process.argv[2] || 1);
  await BaileysKeys.destroy({ where: { whatsappId } });
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp) {
    console.error("WhatsApp not found:", whatsappId);
    process.exit(1);
  }
  await whatsapp.update({
    status: "DISCONNECTED",
    qrcode: "",
    session: "",
    retries: 0
  });
  console.log(
    JSON.stringify({
      ok: true,
      id: whatsapp.id,
      name: whatsapp.name,
      status: whatsapp.status
    })
  );
  process.exit(0);
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
