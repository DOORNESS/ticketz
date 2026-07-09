#!/usr/bin/env node
/**
 * DNS de produção Ticketz — api.fortmax.com.br → VPS Contabo.
 * Não deploya Worker/Container (produção nativa na VPS).
 *
 * Uso:
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \
 *   VPS_IP=31.220.103.226 \
 *   node scripts/setup-cloudflare-api.mjs
 */

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME || "fortmax.com.br";
const VPS_IP = process.env.VPS_IP || "31.220.103.226";
const API_HOST = process.env.API_HOST || "api.fortmax.com.br";
const API_SUBDOMAIN = API_HOST.split(".")[0];

if (!CF_TOKEN) {
  console.error("❌ CLOUDFLARE_API_TOKEN é obrigatório.");
  process.exit(1);
}

async function cf(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function resolveZoneId() {
  if (ZONE_ID) return ZONE_ID;
  const res = await cf(`https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}`);
  if (!res.data?.success || !res.data.result?.length) {
    throw new Error(`Zone não encontrada: ${ZONE_NAME}`);
  }
  return res.data.result[0].id;
}

async function removeWorkerRoutes(zoneId) {
  const res = await cf(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`
  );
  if (!res.data?.success) return;
  for (const route of res.data.result || []) {
    if (!route.pattern?.includes("api.fortmax.com.br")) continue;
    await cf(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes/${route.id}`,
      { method: "DELETE" }
    );
    console.log(`✅ Rota Worker removida: ${route.pattern}`);
  }
}

async function ensureDnsRecord(zoneId) {
  const zoneApi = `https://api.cloudflare.com/client/v4/zones/${zoneId}`;
  const list = await cf(`${zoneApi}/dns_records?name=${API_HOST}`);
  if (!list.data?.success) throw new Error(JSON.stringify(list.data));

  const desired = {
    type: "A",
    name: API_SUBDOMAIN,
    content: VPS_IP,
    proxied: true,
    comment: "Ticketz produção VPS Contabo"
  };

  const existing = (list.data.result || []).find(r => r.name === API_HOST);
  if (existing) {
    const updated = await cf(`${zoneApi}/dns_records/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(desired)
    });
    if (!updated.data?.success) throw new Error(JSON.stringify(updated.data));
    console.log(`✅ DNS atualizado: ${API_HOST} → ${VPS_IP}`);
    return;
  }

  const created = await cf(`${zoneApi}/dns_records`, {
    method: "POST",
    body: JSON.stringify(desired)
  });
  if (!created.data?.success) throw new Error(JSON.stringify(created.data));
  console.log(`✅ DNS criado: ${API_HOST} → ${VPS_IP}`);
}

async function ensureSslFlexible(zoneId) {
  const res = await cf(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`,
    { method: "PATCH", body: JSON.stringify({ value: "flexible" }) }
  );
  if (res.data?.success) console.log("✅ SSL mode: Flexible (origin HTTP:80 via IIS)");
}

async function main() {
  const zoneId = await resolveZoneId();
  console.log(`→ DNS produção VPS: ${API_HOST} → ${VPS_IP}`);
  await removeWorkerRoutes(zoneId);
  await ensureDnsRecord(zoneId);
  await ensureSslFlexible(zoneId);
  console.log(`\n🎯 API produção (VPS): https://${API_HOST}`);
}

main().catch(err => {
  console.error("❌", err.message);
  process.exit(1);
});
