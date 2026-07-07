import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { corsOrigin } from "./helpers/corsOrigin";

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

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    fast: true,
    routes: coreRoutesReady,
    routesError: coreRoutesError?.message || null
  });
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
