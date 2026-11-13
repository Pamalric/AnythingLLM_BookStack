import { AppError } from "@bookstack-sync/shared";
import { Router } from "express";
import type { AppConfig } from "../config.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { createSettingsService } from "../services/settings-service.js";

export function createSettingsRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  const service = createSettingsService(config);

  router.use(requireAuth);

  router.get("/", async (req, res, next) => {
    try {
      const settings = await service.getPublicSettings();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/", async (req, res, next) => {
    try {
      await service.patchSettings(req.body, req.sessionUser ?? "unknown");
      const settings = await service.getPublicSettings();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });

  router.put("/secrets", async (req, res, next) => {
    try {
      await service.updateSecrets(req.body, req.sessionUser ?? "unknown");
      const settings = await service.getPublicSettings();
      res.json({
        updated: true,
        credentials: settings.credentials,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/workspaces", async (req, res, next) => {
    try {
      const result = await service.listWorkspaces();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createConnectionsRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  const service = createSettingsService(config);

  router.post("/test", requireAuth, async (req, res, next) => {
    try {
      const results = await service.testConnections(req.body, req.sessionUser ?? "unknown");
      const ok =
        Object.values(results).length > 0 && Object.values(results).every((r) => r.ok);
      res.status(200).json({ ok, results });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function appErrorHandler(
  err: unknown,
  req: import("express").Request,
  res: import("express").Response,
  _next: import("express").NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      code: err.code,
      message: err.message,
      requestId: req.requestId,
      details: err.details,
    });
    return;
  }
  const message = err instanceof Error ? err.message : "Erreur interne";
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message,
    requestId: req.requestId,
  });
}
