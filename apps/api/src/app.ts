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

  const requireAuth = createRequireAuth(config);
  app.get("/api/v1/dashboard", requireAuth, (req, res) => {
    res.json({
      message: "Tableau de bord — à compléter au lot 6",
      user: req.sessionUser,
    });
  });

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

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = err instanceof Error ? err.message : "Erreur interne";
      res.status(500).json({
        code: "INTERNAL_ERROR",
        message: config.isProd ? "Erreur interne" : message,
        requestId: req.requestId,
      });
    },
  );

  return app;
}
