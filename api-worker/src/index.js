import { Container } from "@cloudflare/containers";

const FRONTEND_ORIGIN = "https://suporte.fortmax.com.br";
const MAX_PROXY_ATTEMPTS = 4;
const PROXY_TIMEOUT_MS = 90000;
const RETRYABLE_ERROR_MARKERS = [
  "blockConcurrencyWhile",
  "waited for too long",
  "waited too long",
  "container is not running",
  "failed to start",
  "connection refused",
  "ECONNREFUSED",
  "ERR_API_WARMING_UP",
  "ERR_UPSTREAM_TIMEOUT"
];

function buildContainerEnv(env) {
  const passthroughKeys = [
    "PORT",
    "HOST",
    "NODE_ENV",
    "LISTEN_FIRST",
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
    "DB_CONNECT_TIMEOUT",
    "DB_ACQUIRE",
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
    "OPENAI_API_KEY",
    "OPENAI_KEY",
    "AI_PROVIDER",
    "AI_BASE_URL",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
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
    NODE_ENV: "production",
    LISTEN_FIRST: "true"
  };

  for (const key of passthroughKeys) {
    if (env[key] != null && env[key] !== "") {
      vars[key] = env[key];
    }
  }

  return vars;
}

function buildCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowedOrigin =
    origin === FRONTEND_ORIGIN ? origin : FRONTEND_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      request.headers.get("Access-Control-Request-Headers") ||
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function jsonResponse(request, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...buildCorsHeaders(request),
      ...extraHeaders
    }
  });
}

function isRetryableError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_ERROR_MARKERS.some(marker =>
    message.toLowerCase().includes(marker.toLowerCase())
  );
}

function isRetryableResponse(response) {
  if (!response) {
    return false;
  }

  if (response.status === 503 || response.status === 502 || response.status === 504) {
    return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function snapshotRequest(request) {
  const headers = new Headers(request.headers);
  const method = request.method;
  const url = request.url;

  if (method === "GET" || method === "HEAD") {
    return () =>
      new Request(url, {
        method,
        headers
      });
  }

  const body = await request.arrayBuffer();

  return () =>
    new Request(url, {
      method,
      headers,
      body
    });
}

export class TicketzBackend extends Container {
  defaultPort = 3000;
  sleepAfter = "720h";
  enableInternet = true;
  requiredPorts = [3000];

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = buildContainerEnv(env);
  }

  onStart() {
    console.log("Ticketz container started and port 3000 is ready");
  }

  onError(error) {
    console.error("Ticketz container error:", error);
  }
}

async function proxyToContainer(request, env) {
  const id = env.TICKETZ_BACKEND.idFromName("prod");
  const stub = env.TICKETZ_BACKEND.get(id);
  return stub.fetch(request, { signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) });
}

function mergeCorsOntoResponse(response, request) {
  const headers = new Headers(response.headers);
  const cors = buildCorsHeaders(request);
  Object.entries(cors).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request)
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/__worker_health") {
      return jsonResponse(request, { ok: true, worker: "fortmax-ticketz-api" });
    }

    const createProxyRequest = await snapshotRequest(request);
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_PROXY_ATTEMPTS; attempt += 1) {
      try {
        const response = await proxyToContainer(createProxyRequest(), env);

        if (isRetryableResponse(response) && attempt < MAX_PROXY_ATTEMPTS) {
          await response.body?.cancel?.();
          await sleep(Math.min(attempt * 1500, 6000));
          continue;
        }

        return mergeCorsOntoResponse(response, request);
      } catch (error) {
        lastError = error;
        const retryable = isRetryableError(error);
        console.error(
          `Ticketz API proxy attempt ${attempt}/${MAX_PROXY_ATTEMPTS} failed:`,
          error instanceof Error ? error.message : error
        );

        if (!retryable || attempt === MAX_PROXY_ATTEMPTS) {
          break;
        }

        await sleep(Math.min(attempt * 1500, 6000));
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);

    return jsonResponse(
      request,
      {
        ok: false,
        error: "ERR_API_WARMING_UP",
        message
      },
      503,
      { "Retry-After": "3" }
    );
  },

  async scheduled(_event, env) {
    try {
      const id = env.TICKETZ_BACKEND.idFromName("prod");
      const stub = env.TICKETZ_BACKEND.get(id);
      await stub.fetch("https://api.fortmax.com.br/health", {
        signal: AbortSignal.timeout(30000)
      });
    } catch (error) {
      console.error("Container keep-warm ping failed:", error);
    }
  }
};
