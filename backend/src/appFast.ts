import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { corsOrigin } from "./helpers/corsOrigin";
import AppError from "./errors/AppError";
import { logger } from "./utils/logger";

const app = express();

app.use(
  cors({
    credentials: true,
    origin: corsOrigin,
    exposedHeaders: [
      "Content-Range",
      "X-Content-Range",
      "Date",
      "Accept-Ranges",
      "Content-Length"
    ]
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));

let coreRoutesReady = false;
let coreRoutesError: Error | null = null;
let coreRoutesPromise: Promise<void> | null = null;

const LOGIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_RATE_LIMIT_BLOCK_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_FAILURES = 8;

type LoginAttempt = {
  count: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const loginAttempts = new Map<string, LoginAttempt>();

const publicSettingsKeys = new Set([
  "allowSignup",
  "primaryColorLight",
  "primaryColorDark",
  "appLogoLight",
  "appLogoDark",
  "appLogoFavicon",
  "appName",
  "loginPageLinks",
  "loginSidePanelImage",
  "loginBackgroundContent",
  "vapidPublicKey",
  "extensionDownloadUrl",
  "turnstileSiteKey",
  "TURNSTILE_SITE_KEY",
  "cfTurnstileSiteKey"
]);

const turnstileSiteKeyAliases = new Set([
  "turnstileSiteKey",
  "TURNSTILE_SITE_KEY",
  "cfTurnstileSiteKey"
]);

const isTurnstileEnabled = (): boolean =>
  ["true", "1", "yes", "enabled"].includes(
    String(process.env.TURNSTILE_ENABLED || "")
      .trim()
      .toLowerCase()
  );

const readTurnstileSiteKeyFromEnv = (): string | null =>
  ["TURNSTILE_SITE_KEY", "turnstileSiteKey", "CF_TURNSTILE_SITE_KEY"]
    .map(key => process.env[key]?.trim())
    .find(value => Boolean(value)) || null;

const getClientIp = (req: express.Request): string => {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) {
    return cfIp.trim();
  }

  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket.remoteAddress || "unknown";
};

const getLoginRateLimitKey = (req: express.Request): string => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "unknown";

  return `${getClientIp(req)}:${email}`;
};

const getActiveLoginAttempt = (
  req: express.Request
): LoginAttempt | null => {
  const attempt = loginAttempts.get(getLoginRateLimitKey(req));
  if (!attempt) {
    return null;
  }

  const now = Date.now();
  if (attempt.blockedUntil > now) {
    return attempt;
  }

  if (now - attempt.windowStartedAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(getLoginRateLimitKey(req));
    return null;
  }

  return attempt;
};

const isLoginRateLimited = (req: express.Request): boolean => {
  const attempt = getActiveLoginAttempt(req);
  return Boolean(attempt && attempt.blockedUntil > Date.now());
};

const recordFailedLoginAttempt = (req: express.Request): void => {
  const key = getLoginRateLimitKey(req);
  const now = Date.now();
  const current = loginAttempts.get(key);

  const attempt =
    current && now - current.windowStartedAt <= LOGIN_RATE_LIMIT_WINDOW_MS
      ? current
      : { count: 0, windowStartedAt: now, blockedUntil: 0 };

  attempt.count += 1;
  if (attempt.count >= LOGIN_RATE_LIMIT_MAX_FAILURES) {
    attempt.blockedUntil = now + LOGIN_RATE_LIMIT_BLOCK_MS;
  }

  loginAttempts.set(key, attempt);
};

const clearLoginAttempts = (req: express.Request): void => {
  loginAttempts.delete(getLoginRateLimitKey(req));
};

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    fast: true,
    routes: coreRoutesReady,
    routesError: coreRoutesError?.message || null
  });
});

app.get("/public-settings/:settingKey", (req, res) => {
  const { settingKey } = req.params;

  if (!publicSettingsKeys.has(settingKey)) {
    return res.status(200).json(null);
  }

  if (turnstileSiteKeyAliases.has(settingKey)) {
    return res
      .status(200)
      .json(isTurnstileEnabled() ? readTurnstileSiteKeyFromEnv() : null);
  }

  return res.status(200).json(null);
});

app.post("/auth/login", async (req, res) => {
  try {
    if (isLoginRateLimited(req)) {
      return res.status(429).json({ error: "ERR_TOO_MANY_LOGIN_ATTEMPTS" });
    }

    await ensureCoreRoutes();

    const { email, password, turnstileToken } = req.body;
    const { verifyTurnstileToken } =
      await import("./services/AuthServices/VerifyTurnstileService");
    const { ensureAuthSecretsReady } = await import("./config/auth");
    const { SendRefreshToken } = await import("./helpers/SendRefreshToken");
    const AuthUserService = (
      await import("./services/UserServices/AuthUserService")
    ).default;

    await verifyTurnstileToken(
      turnstileToken,
      req.ip || req.socket.remoteAddress
    );
    await ensureAuthSecretsReady();

    const { token, serializedUser, refreshToken } = await AuthUserService({
      email,
      password,
      language: null
    });

    SendRefreshToken(res, refreshToken);
    clearLoginAttempts(req);

    return res.status(200).json({
      token,
      user: serializedUser
    });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.statusCode === 401) {
        recordFailedLoginAttempt(req);
      }

      res.status(error.statusCode).json({ error: error.message });
      try {
        logger[error.level](error);
      } catch {
        // logging must never block auth responses
      }
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: "Internal server error",
      message
    });
    try {
      logger.error(error);
    } catch {
      // logging must never block auth responses
    }
  }
});

export async function ensureCoreRoutes(): Promise<void> {
  if (coreRoutesReady) {
    return;
  }

  if (coreRoutesError) {
    throw coreRoutesError;
  }

  if (!coreRoutesPromise) {
    coreRoutesPromise = (async () => {
      try {
        await import("./bootstrap");
        await import("reflect-metadata");
        await import("express-async-errors");
        await import("./database");

        const [{ default: authRoutes }, { default: settingRoutes }] =
          await Promise.all([
            import("./routes/authRoutes"),
            import("./routes/settingRoutes")
          ]);

        app.use("/auth", authRoutes);
        app.use(settingRoutes);
        app.use((err, _req, res, _next) => {
          if (err instanceof AppError) {
            logger[err.level](err);
            return res.status(err.statusCode).json({ error: err.message });
          }

          logger.error(err);
          return res.status(500).json({ error: "Internal server error" });
        });
        coreRoutesReady = true;
      } catch (error) {
        coreRoutesError =
          error instanceof Error ? error : new Error(String(error));
        throw coreRoutesError;
      }
    })();
  }

  await coreRoutesPromise;
}

const isFastShellPath = (req: express.Request): boolean =>
  req.path === "/health" ||
  req.path.startsWith("/public-settings/") ||
  (req.method === "POST" && req.path === "/auth/login");

app.use(async (req, res, next) => {
  if (isFastShellPath(req)) {
    return;
  }

  try {
    await ensureCoreRoutes();
    return next();
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: "ERR_API_ROUTES_LOADING",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default app;
