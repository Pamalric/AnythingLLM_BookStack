import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { SYNC_LOCK_KEY } from "@bookstack-sync/sync-engine";

/** Conservation historique SyncRun / SyncEvent (CDC §7.3). */
export const HISTORY_RETENTION_DAYS = 90;

/**
 * Marque les runs RUNNING orphelins après redémarrage / bail expiré.
 * Le navigateur fermé ne stoppe pas un job ; un crash process oui.
 */
export async function recoverInterruptedRuns(ownerHint = "startup"): Promise<number> {
  const lock = await prisma.jobLock.findUnique({ where: { key: SYNC_LOCK_KEY } });
  const now = new Date();
  const lockAlive = lock != null && lock.leaseUntil.getTime() > now.getTime();

  if (lockAlive) {
    return 0;
  }

  const stuck = await prisma.syncRun.findMany({ where: { status: "RUNNING" } });
  if (stuck.length === 0) {
    if (lock) {
      await prisma.jobLock.deleteMany({ where: { key: SYNC_LOCK_KEY } });
    }
    return 0;
  }

  for (const run of stuck) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: now,
        phase: "interrupted",
        errorSummary: `Exécution interrompue (${ownerHint}) — relancer une sync ou une réconciliation`,
      },
    });
    await prisma.syncEvent.create({
      data: {
        runId: run.id,
        action: "RUN",
        status: "FAILED",
        message: "Run marqué FAILED après interruption process / verrou expiré",
        diagnosticCode: "INTERRUPTED",
      },
    });
    await prisma.sourcePage.updateMany({
      where: { state: "PROCESSING" },
      data: { state: "OUTDATED", lastError: "Sync interrompue — à relancer" },
    });
  }

  await prisma.jobLock.deleteMany({ where: { key: SYNC_LOCK_KEY } });
  logger.warn({ count: stuck.length }, "Runs RUNNING récupérés après interruption");
  return stuck.length;
}

/** Purge des SyncRun (+ events) plus vieux que la rétention. */
export async function purgeOldSyncHistory(
  retentionDays = HISTORY_RETENTION_DAYS,
): Promise<{ runsDeleted: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const old = await prisma.syncRun.findMany({
    where: {
      status: { not: "RUNNING" },
      startedAt: { lt: cutoff },
    },
    select: { id: true },
  });
  if (old.length === 0) return { runsDeleted: 0 };

  const ids = old.map((r) => r.id);
  await prisma.syncEvent.deleteMany({ where: { runId: { in: ids } } });
  const result = await prisma.syncRun.deleteMany({ where: { id: { in: ids } } });
  logger.info({ runsDeleted: result.count, retentionDays }, "Purge historique sync");
  return { runsDeleted: result.count };
}
