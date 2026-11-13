import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import type { AppConfig } from "./config.js";
import { createRequireAuth } from "./middleware/require-auth.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { createAuthRouter } from "./routes/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createConsoleRouter } from "./routes/console.js";
import {
  appErrorHandler,
  createConnectionsRouter,
  createSettingsRouter,
} from "./routes/settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(config: AppConfig, passwordHash: string): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  if (config.isProd) {
    app.use(helmet());
  } else {
    app.use(helmet({ contentSecurityPolicy: false }));
  }
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use(createHealthRouter());
  app.use("/api/v1/auth", createAuthRouter(config, passwordHash));
  app.use("/api/v1/settings", createSettingsRouter(config));
  app.use("/api/v1/connections", createConnectionsRouter(config));
  app.use("/api/v1", createConsoleRouter(config));

  const webDist = path.resolve(__dirname, "../../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path === "/health" || req.path === "/ready") {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(appErrorHandler);

  return app;
}
