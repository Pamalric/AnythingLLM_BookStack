import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "token",
      "apiKey",
      "BOOKSTACK_TOKEN_SECRET",
      "ANYTHINGLLM_API_KEY",
      "SESSION_SECRET",
      "ADMIN_PASSWORD",
      "ADMIN_PASSWORD_HASH",
    ],
    censor: "[Redacted]",
  },
});
