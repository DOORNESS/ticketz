import { Container } from "@cloudflare/containers";

function buildContainerEnv(env) {
  const passthroughKeys = [
    "PORT",
    "HOST",
    "NODE_ENV",
    "FRONTEND_URL",
    "BACKEND_URL",
    "DB_DIALECT",
    "DB_HOST",
    "DB_PORT",
    "DB_USER",
    "DB_PASS",
    "DB_NAME",
    "DB_SCHEMA",
    "DB_SSL",
    "DB_SSL_REJECT_UNAUTHORIZED",
    "DB_TIMEZONE",
    "DB_MAX_CONNECTIONS",
    "DB_MIN_CONNECTIONS",
    "REDIS_URI",
    "VERIFY_TOKEN",
    "SOCKET_ADMIN",
    "TZ",
    "USER_LIMIT",
    "CONNECTIONS_LIMIT",
    "CLOSED_SEND_BY_ME",
    "STORAGE_ROOT_PREFIX",
    "AUTO_MIGRATE",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "JWT_ACCESS_EXPIRES_IN",
    "JWT_REFRESH_EXPIRES_IN",
    "AI_QUEUE_CONCURRENCY",
    "AI_QUEUE_DEBOUNCE_MS",
    "AI_QUEUE_MAX_ATTEMPTS",
    "AI_QUEUE_BACKOFF_MS",
    "AI_QUEUE_CONGESTION_THRESHOLD"
  ];

  const vars = {
    PORT: "3000",
    HOST: "0.0.0.0",
    NODE_ENV: "production"
  };

  for (const key of passthroughKeys) {
    if (env[key] != null && env[key] !== "") {
      vars[key] = env[key];
    }
  }

  return vars;
}

export class TicketzBackend extends Container {
  defaultPort = 3000;
  sleepAfter = "30m";
  enableInternet = true;
  requiredPorts = [3000];

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = buildContainerEnv(env);
  }

  onError(error) {
    console.error("Ticketz container error:", error);
    throw error;
  }
}

export default {
  async fetch(request, env) {
    try {
      const id = env.TICKETZ_BACKEND.idFromName("prod");
      const stub = env.TICKETZ_BACKEND.get(id);
      return await stub.fetch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Ticketz API worker error:", message);
      return new Response(`API worker error: ${message}`, { status: 500 });
    }
  }
};
