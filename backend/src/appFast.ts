import "./bootstrap";
import "reflect-metadata";
import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import "./database";
import authRoutes from "./routes/authRoutes";
import settingRoutes from "./routes/settingRoutes";
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

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, fast: true });
});

app.use("/auth", authRoutes);
app.use(settingRoutes);

export default app;
