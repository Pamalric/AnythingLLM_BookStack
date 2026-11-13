import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config.js";
import { assertCsrf, readSession } from "../auth/session.js";

export function createRequireAuth(config: AppConfig) {
  return function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const session = readSession(req, config);
    if (!session) {
      res.status(401).json({
        code: "UNAUTHORIZED",
        message: "Authentification requise",
        requestId: req.requestId,
      });
      return;
    }

    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !assertCsrf(req, session)) {
      res.status(403).json({
        code: "CSRF_REJECTED",
        message: "Jeton CSRF manquant ou invalide",
        requestId: req.requestId,
      });
      return;
    }

    req.sessionUser = session.sub;
    next();
  };
}
