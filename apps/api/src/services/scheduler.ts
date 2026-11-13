import type { AppConfig } from "../config.js";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import type { SyncService } from "./sync-service.js";

/**
 * Planificateur simple (lot 5) — intervalle configurable, fuseau Europe/Paris
 * utilisé pour l'affichage ; le tick est en UTC ms.
 */
export function startScheduler(_config: AppConfig, sync: SyncService): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTickCheck = 0;

  const tick = async () => {
    const now = Date.now();
    // Éviter les ticks trop rapprochés si le timer est agressif
    if (now - lastTickCheck < 20_000) return;
    lastTickCheck = now;

    try {
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      if (!settings?.scheduleEnabled) return;

      const intervalMs = Math.max(1, settings.scheduleIntervalMin) * 60_000;
      const lastRun = await prisma.syncRun.findFirst({
        where: { trigger: "SCHEDULED", status: { in: ["SUCCESS", "PARTIAL", "FAILED"] } },
        orderBy: { startedAt: "desc" },
      });
      const running = await prisma.syncRun.findFirst({ where: { status: "RUNNING" } });
      if (running) return;

      const lastAt = lastRun?.finishedAt?.getTime() ?? lastRun?.startedAt?.getTime() ?? 0;
      if (lastAt && now - lastAt < intervalMs) return;

      logger.info(
        { intervalMin: settings.scheduleIntervalMin, timezone: settings.timezone },
        "Déclenchement sync planifiée",
      );
      await sync.startSyncRun({
        type: "incremental",
        trigger: "SCHEDULED",
        actor: "scheduler",
      });
    } catch (err) {
      logger.warn({ err }, "Échec tick planificateur (non bloquant)");
    }
  };

  timer = setInterval(() => void tick(), 30_000);
  void tick();

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}
