import { LoginBodySchema } from "@bookstack-sync/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { AppConfig } from "../config.js";
import { verifyPassword } from "../auth/password.js";
import {
  clearSessionCookies,
  createSessionToken,
  readSession,
  setSessionCookies,
} from "../auth/session.js";
import { prisma } from "../db.js";

export function createAuthRouter(config: AppConfig, passwordHash: string): Router {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      code: "RATE_LIMITED",
      message: "Trop de tentatives de connexion",
      requestId: "rate-limit",
    },
  });

  router.post("/login", loginLimiter, async (req, res) => {
    const parsed = LoginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Identifiants invalides",
        requestId: req.requestId,
      });
      return;
    }

    const { username, password } = parsed.data;
    const userOk = username === config.ADMIN_USERNAME;
    const passOk = userOk ? await verifyPassword(passwordHash, password) : false;

    if (!userOk || !passOk) {
      res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Nom d'utilisateur ou mot de passe incorrect",
        requestId: req.requestId,
      });
      return;
    }

    const session = createSessionToken(username, config.SESSION_SECRET);
    setSessionCookies(res, config, session);

    await prisma.auditEvent.create({
      data: {
        actor: username,
        action: "auth.login",
        entity: "session",
        details: JSON.stringify({ requestId: req.requestId }),
      },
    });

    res.json({
      authenticated: true,
      username,
    });
  });

  router.post("/logout", async (req, res) => {
    const session = readSession(req, config);
    clearSessionCookies(res, config);
    if (session) {
      await prisma.auditEvent.create({
        data: {
          actor: session.sub,
          action: "auth.logout",
          entity: "session",
        },
      });
    }
    res.status(204).send();
  });

  router.get("/me", (req, res) => {
    const session = readSession(req, config);
    if (!session) {
      res.status(401).json({
        code: "UNAUTHORIZED",
        message: "Non authentifié",
        requestId: req.requestId,
      });
      return;
    }
    res.json({ authenticated: true, username: session.sub });
  });

  return router;
}
