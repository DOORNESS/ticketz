import "./bootstrap";
import "reflect-metadata";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";

import "./database";
import AppError from "./errors/AppError";
import routes from "./routes";
import * as VersionController from "./controllers/VersionController";
import { logger } from "./utils/logger";
import { messageQueue, sendScheduledMessages } from "./queues";
import { corsOrigin } from "./helpers/corsOrigin";
import { getBuildInfo } from "./helpers/buildInfo";
import { servePublicMedia } from "./helpers/servePublicMedia";

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();

app.set("queues", {
  messageQueue,
  sendScheduledMessages
});

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
app.use(Sentry.Handlers.requestHandler());
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, ...getBuildInfo() });
});
app.get("/version", VersionController.versionPublic);
app.get("/public/*", async (req, res) => {
  try {
    await servePublicMedia(req, res);
  } catch (err) {
    logger.error({ err, path: req.params[0] }, "Error serving public media");
    res.status(500).end();
  }
});

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    if (durationMs < 1000) {
      return;
    }

    logger.warn(
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs
      },
      "Slow HTTP request"
    );
  });

  next();
});

app.use((req, _res, next) => {
  const { method, url, query, body, headers } = req;
  logger.trace(
    { method, url, query, body, headers },
    `Incoming request: ${req.method} ${req.url}`
  );
  next();
});

app.use(routes);

app.use(Sentry.Handlers.errorHandler());
app.use(async (err: Error, req: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    logger[err.level](err);
    return res.status(err.statusCode).json({ error: err.message });
  }

  logger.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

export default app;
