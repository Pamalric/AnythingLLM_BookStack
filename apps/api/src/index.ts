import { loadConfig } from "./config.js";
import { ensureSettingsRow, resolveAdminPasswordHash } from "./bootstrap.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const passwordHash = await resolveAdminPasswordHash(config);
  await ensureSettingsRow();

  const app = createApp(config, passwordHash);
  app.listen(config.PORT, config.HOST, () => {
    logger.info({ host: config.HOST, port: config.PORT }, "BookStack Sync API démarrée");
  });
}

main().catch((err) => {
  logger.error({ err }, "Échec démarrage");
  process.exit(1);
});
