import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { loadConfig } from "./config.js";
import { ensureSettingsRow, resolveAdminPasswordHash } from "./bootstrap.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main(): Promise<void> {
  const config = loadConfig();
  const passwordHash = await resolveAdminPasswordHash(config);
  await ensureSettingsRow();

  // Nettoyer un slug erroné si une clé API a été collée dans workspaceSlug
  const { prisma } = await import("./db.js");
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings?.workspaceSlug && /^[A-Z0-9]{4,}-[A-Z0-9-]{8,}$/i.test(settings.workspaceSlug)) {
    await prisma.settings.update({
      where: { id: 1 },
      data: { workspaceSlug: null },
    });
    logger.warn("workspaceSlug ressemblait à une clé API — valeur effacée");
  }

  const app = createApp(config, passwordHash);

  const { createSyncService } = await import("./services/sync-service.js");
  const { startScheduler } = await import("./services/scheduler.js");
  const sync = createSyncService(config);
  const stopScheduler = startScheduler(config, sync);

  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info({ host: config.HOST, port: config.PORT }, "BookStack Sync API démarrée");
  });

  const shutdown = () => {
    stopScheduler();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "Échec démarrage");
  process.exit(1);
});
