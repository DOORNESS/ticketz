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
    String(process.env.TURNSTILE_ENABLED || "").trim().toLowerCase()
  );

const readTurnstileSiteKeyFromEnv = (): string | null =>
  ["TURNSTILE_SITE_KEY", "turnstileSiteKey", "CF_TURNSTILE_SITE_KEY"]
    .map(key => process.env[key]?.trim())
    .find(value => Boolean(value)) || null;

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
    const { email, password, turnstileToken } = req.body;
    const { verifyTurnstileToken } = await import(
      "./services/AuthServices/VerifyTurnstileService"
    );
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

    return res.status(200).json({
      token,
      user: serializedUser
    });
  } catch (error) {
    if (error instanceof AppError) {
      logger[error.level](error);
      return res.status(error.statusCode).json({ error: error.message });
    }

    logger.error(error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error)
    });
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

app.use(async (req, res, next) => {
  if (req.path === "/health") {
    return next();
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
