import type { AppConfig } from "./config.js";
import { hashPassword } from "./auth/password.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";

export async function resolveAdminPasswordHash(config: AppConfig): Promise<string> {
  if (config.ADMIN_PASSWORD_HASH) {
    return config.ADMIN_PASSWORD_HASH;
  }
  if (!config.ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD ou ADMIN_PASSWORD_HASH requis");
  }
  const hash = await hashPassword(config.ADMIN_PASSWORD);
  logger.warn(
    "ADMIN_PASSWORD en clair détecté au démarrage : préférer ADMIN_PASSWORD_HASH en production",
  );
  return hash;
}

export async function ensureSettingsRow(): Promise<void> {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!existing) {
    await prisma.settings.create({ data: { id: 1 } });
  }
}
