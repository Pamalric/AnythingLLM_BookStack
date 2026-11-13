import { Router } from "express";
import { prisma } from "../db.js";

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  router.get("/ready", async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ready" });
    } catch {
      res.status(503).json({
        code: "NOT_READY",
        message: "Base de données indisponible",
        requestId: req.requestId,
      });
    }
  });

  return router;
}
