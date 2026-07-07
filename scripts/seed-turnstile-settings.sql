-- Cloudflare Turnstile (LoveMarcas) — execute no Supabase SQL Editor (schema ticketz).
-- Substitua <SECRET_KEY> pela chave secreta do painel Cloudflare antes de rodar.
SET search_path TO ticketz;

UPDATE "Settings"
SET "value" = '0x4AAAAAADhSILt9PsBiVeID', "updatedAt" = NOW()
WHERE "companyId" = 1 AND "key" = 'turnstileSiteKey';

INSERT INTO "Settings" ("key", "value", "companyId", "createdAt", "updatedAt")
SELECT 'turnstileSiteKey', '0x4AAAAAADhSILt9PsBiVeID', 1, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "Settings" WHERE "companyId" = 1 AND "key" = 'turnstileSiteKey'
);

UPDATE "Settings"
SET "value" = '<SECRET_KEY>', "updatedAt" = NOW()
WHERE "companyId" = 1 AND "key" = 'turnstileSecretKey';

INSERT INTO "Settings" ("key", "value", "companyId", "createdAt", "updatedAt")
SELECT 'turnstileSecretKey', '<SECRET_KEY>', 1, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "Settings" WHERE "companyId" = 1 AND "key" = 'turnstileSecretKey'
);
