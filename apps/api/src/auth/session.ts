import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import type { AppConfig } from "../config.js";

const SESSION_COOKIE = "bss_session";
const CSRF_COOKIE = "bss_csrf";

export type SessionPayload = {
  sub: string;
  exp: number;
  csrf: string;
};

export function createSessionToken(
  username: string,
  secret: string,
  ttlSeconds = 60 * 60 * 8,
): { token: string; csrf: string; expiresAt: Date } {
  const csrf = randomBytes(24).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ sub: username, exp, csrf } satisfies SessionPayload));
  const body = payload.toString("base64url");
  const sig = sign(body, secret);
  return {
    token: `${body}.${sig}`,
    csrf,
    expiresAt: new Date(exp * 1000),
  };
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) {
    return null;
  }
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.sub || !payload.exp || !payload.csrf) {
      return null;
    }
    if (payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function setSessionCookies(
  res: Response,
  config: AppConfig,
  session: { token: string; csrf: string; expiresAt: Date },
): void {
  const base = {
    httpOnly: true,
    secure: Boolean(config.COOKIE_SECURE) || config.isProd,
    sameSite: config.COOKIE_SAME_SITE,
    path: "/",
    expires: session.expiresAt,
  } as const;

  res.cookie(SESSION_COOKIE, session.token, base);
  res.cookie(CSRF_COOKIE, session.csrf, { ...base, httpOnly: false });
}

export function clearSessionCookies(res: Response, config: AppConfig): void {
  const base = {
    httpOnly: true,
    secure: Boolean(config.COOKIE_SECURE) || config.isProd,
    sameSite: config.COOKIE_SAME_SITE,
    path: "/",
  } as const;
  res.clearCookie(SESSION_COOKIE, base);
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}

export function readSession(req: Request, config: AppConfig): SessionPayload | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string") {
    return null;
  }
  return verifySessionToken(token, config.SESSION_SECRET);
}

export function assertCsrf(req: Request, session: SessionPayload): boolean {
  const header = req.header("x-csrf-token");
  const cookie = req.cookies?.[CSRF_COOKIE];
  if (!header || !cookie) {
    return false;
  }
  return header === session.csrf && cookie === session.csrf;
}

export { SESSION_COOKIE, CSRF_COOKIE };
