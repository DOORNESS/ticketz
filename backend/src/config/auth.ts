import { cacheLayer } from "../libs/cache";
import { logger } from "../utils/logger";

type JwtConfig = {
  secret: string | null;
  expiresIn: string;
  refreshSecret: string | null;
  refreshExpiresIn: string;
};

const CACHE_KEY_JWT_SECRET = "TICKETZ_JWT_SECRET";
const CACHE_KEY_JWT_REFRESH_SECRET = "TICKETZ_JWT_REFRESH_SECRET";

function generateSecret(length: number): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+";
  let secret = "";
  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    secret += charset[randomIndex];
  }
  return secret;
}

async function generateSecretIfNotExists(cacheKey: string): Promise<string> {
  let secret = await cacheLayer.get(cacheKey);
  if (!secret) {
    secret = generateSecret(32);
    await cacheLayer.set(cacheKey, secret);
    logger.debug(`[auth.ts] Generated ${cacheKey}`);
  } else {
    logger.debug(`[auth.ts] Loaded ${cacheKey} from cache`);
  }
  return secret;
}

const jwtConfig: JwtConfig = {
  secret: process.env.JWT_SECRET?.trim() || null,
  expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "8h",
  refreshSecret: process.env.JWT_REFRESH_SECRET?.trim() || null,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d"
};

const secretPromise = jwtConfig.secret
  ? Promise.resolve(jwtConfig.secret)
  : generateSecretIfNotExists(CACHE_KEY_JWT_SECRET);

const refreshSecretPromise = jwtConfig.refreshSecret
  ? Promise.resolve(jwtConfig.refreshSecret)
  : generateSecretIfNotExists(CACHE_KEY_JWT_REFRESH_SECRET);

Promise.all([secretPromise, refreshSecretPromise]).then(
  ([secret, refreshSecret]) => {
    jwtConfig.secret = secret;
    jwtConfig.refreshSecret = refreshSecret;
  }
);

export const ensureAuthSecretsReady = async (): Promise<void> => {
  if (jwtConfig.secret && jwtConfig.refreshSecret) {
    return;
  }

  const [secret, refreshSecret] = await Promise.all([
    secretPromise,
    refreshSecretPromise
  ]);

  jwtConfig.secret = secret;
  jwtConfig.refreshSecret = refreshSecret;
};

export default jwtConfig;
