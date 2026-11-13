import { Router } from "express";
import { z } from "zod";
import { AppError } from "@bookstack-sync/shared";
import type { AppConfig } from "../config.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import {
  getDashboard,
  getDocument,
  getSyncRun,
  listDocuments,
  listRemovals,
  listSyncRuns,
} from "../services/console-service.js";
import { createSyncService } from "../services/sync-service.js";

const StartSyncSchema = z.object({
  type: z.enum(["incremental", "full", "dry-run", "document"]).default("incremental"),
  trigger: z
    .enum(["MANUAL", "SCHEDULED", "DOCUMENT", "RECONCILIATION", "DRY_RUN"])
    .default("MANUAL"),
  sourcePageId: z.string().min(1).optional(),
});

export function createConsoleRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  const sync = createSyncService(config);
  router.use(requireAuth);

  router.get("/dashboard", async (_req, res, next) => {
    try {
      res.json(await getDashboard());
    } catch (err) {
      next(err);
    }
  });

  router.get("/documents", async (req, res, next) => {
    try {
      const query: {
        q?: string;
        state?: string;
        bookId?: string;
        page?: string;
        pageSize?: string;
      } = {};
      if (typeof req.query.q === "string") query.q = req.query.q;
      if (typeof req.query.state === "string") query.state = req.query.state;
      if (typeof req.query.bookId === "string") query.bookId = req.query.bookId;
      if (typeof req.query.page === "string") query.page = req.query.page;
      if (typeof req.query.pageSize === "string") query.pageSize = req.query.pageSize;
      res.json(await listDocuments(query));
    } catch (err) {
      next(err);
    }
  });

  router.get("/documents/:id", async (req, res, next) => {
    try {
      res.json(await getDocument(req.params.id!));
    } catch (err) {
      next(err);
    }
  });

  router.post("/documents/:id/sync", async (req, res, next) => {
    try {
      const result = await sync.startSyncRun({
        type: "document",
        trigger: "DOCUMENT",
        actor: req.sessionUser ?? "admin",
        sourcePageId: req.params.id!,
      });
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/sync-runs", async (req, res, next) => {
    try {
      const query: { page?: string; pageSize?: string; status?: string } = {};
      if (typeof req.query.page === "string") query.page = req.query.page;
      if (typeof req.query.pageSize === "string") query.pageSize = req.query.pageSize;
      if (typeof req.query.status === "string") query.status = req.query.status;
      res.json(await listSyncRuns(query));
    } catch (err) {
      next(err);
    }
  });

  router.get("/sync-runs/:id", async (req, res, next) => {
    try {
      res.json(await getSyncRun(req.params.id!));
    } catch (err) {
      next(err);
    }
  });

  router.post("/sync-runs", async (req, res, next) => {
    try {
      const parsed = StartSyncSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new AppError("VALIDATION_ERROR", "Corps de requête invalide", 400, parsed.error.flatten());
      }
      const body = parsed.data;
      const result = await sync.startSyncRun({
        type: body.type,
        trigger: body.type === "dry-run" ? "DRY_RUN" : body.trigger,
        actor: req.sessionUser ?? "admin",
        ...(body.sourcePageId ? { sourcePageId: body.sourcePageId } : {}),
      });
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/removals", async (_req, res, next) => {
    try {
      res.json(await listRemovals());
    } catch (err) {
      next(err);
    }
  });

  router.post("/removals/:id/approve", async (req, res, next) => {
    try {
      res.json(await sync.approveRemoval(req.params.id!, req.sessionUser ?? "admin"));
    } catch (err) {
      next(err);
    }
  });

  router.post("/removals/:id/reject", async (req, res, next) => {
    try {
      res.json(await sync.rejectRemoval(req.params.id!, req.sessionUser ?? "admin"));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
