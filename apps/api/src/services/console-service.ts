import { AppError } from "@bookstack-sync/shared";
import { prisma } from "../db.js";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

export async function getDashboard() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const [
    totalPages,
    synced,
    pending,
    errors,
    pendingRemoval,
    books,
    lastRun,
    running,
  ] = await Promise.all([
    prisma.sourcePage.count(),
    prisma.sourcePage.count({ where: { state: "SYNCED" } }),
    prisma.sourcePage.count({
      where: { state: { in: ["NEW", "OUTDATED", "PROCESSING"] } },
    }),
    prisma.sourcePage.count({ where: { state: "ERROR" } }),
    prisma.pendingRemoval.count({ where: { decision: null } }),
    prisma.sourcePage.findMany({
      where: { bookId: { not: null } },
      distinct: ["bookId"],
      select: { bookId: true },
    }),
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.syncRun.findFirst({ where: { status: "RUNNING" }, orderBy: { startedAt: "desc" } }),
  ]);

  let counters: Record<string, number> = {};
  if (lastRun?.countersJson) {
    try {
      counters = JSON.parse(lastRun.countersJson) as Record<string, number>;
    } catch {
      counters = {};
    }
  }

  const nextRunAt =
    settings?.scheduleEnabled && settings.scheduleIntervalMin
      ? estimateNextRun(lastRun?.finishedAt ?? lastRun?.startedAt ?? null, settings.scheduleIntervalMin)
      : null;

  return {
    connections: {
      bookstack: {
        ok: settings?.lastBookstackTestOk ?? null,
        at: settings?.lastBookstackTestAt?.toISOString() ?? null,
        message: settings?.lastBookstackTestMessage ?? null,
      },
      anythingllm: {
        ok: settings?.lastAnythingllmTestOk ?? null,
        at: settings?.lastAnythingllmTestAt?.toISOString() ?? null,
        message: settings?.lastAnythingllmTestMessage ?? null,
      },
    },
    counts: {
      books: books.length,
      pages: totalPages,
      synced,
      pending,
      errors,
      pendingRemoval,
    },
    schedule: {
      enabled: settings?.scheduleEnabled ?? false,
      intervalMin: settings?.scheduleIntervalMin ?? 60,
      timezone: settings?.timezone ?? "Europe/Paris",
      nextRunAt,
    },
    currentRun: running
      ? {
          id: running.id,
          status: running.status,
          phase: running.phase,
          progressDone: running.progressDone,
          progressTotal: running.progressTotal,
          startedAt: running.startedAt.toISOString(),
          type: running.type,
          trigger: running.trigger,
        }
      : null,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          type: lastRun.type,
          trigger: lastRun.trigger,
          startedAt: lastRun.startedAt.toISOString(),
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
          durationMs:
            lastRun.finishedAt != null
              ? lastRun.finishedAt.getTime() - lastRun.startedAt.getTime()
              : null,
          counters,
          errorSummary: lastRun.errorSummary,
        }
      : null,
    workspaceSlug: settings?.workspaceSlug ?? null,
  };
}

function estimateNextRun(from: Date | null, intervalMin: number): string | null {
  if (!from) return null;
  return new Date(from.getTime() + intervalMin * 60_000).toISOString();
}

export async function listDocuments(query: {
  q?: string;
  state?: string;
  bookId?: string;
  page?: string;
  pageSize?: string;
}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(query.pageSize) || PAGE_SIZE_DEFAULT));
  const where: {
    OR?: Array<Record<string, unknown>>;
    state?: string;
    bookId?: number;
  } = {};

  if (query.q?.trim()) {
    const q = query.q.trim();
    where.OR = [
      { title: { contains: q } },
      { bookName: { contains: q } },
      { chapterName: { contains: q } },
      { sourceKey: { contains: q } },
    ];
  }
  if (query.state) where.state = query.state;
  if (query.bookId) where.bookId = Number(query.bookId);

  const [total, items] = await Promise.all([
    prisma.sourcePage.count({ where }),
    prisma.sourcePage.findMany({
      where,
      orderBy: [{ bookName: "asc" }, { title: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { target: true },
    }),
  ]);

  return {
    page,
    pageSize,
    total,
    items: items.map((d) => ({
      id: d.id,
      sourceKey: d.sourceKey,
      bookstackId: d.bookstackId,
      title: d.title,
      bookId: d.bookId,
      bookName: d.bookName,
      chapterId: d.chapterId,
      chapterName: d.chapterName,
      sourceUrl: d.sourceUrl,
      sourceUpdatedAt: d.sourceUpdatedAt?.toISOString() ?? null,
      lastSyncAt: d.lastSyncAt?.toISOString() ?? null,
      state: d.state,
      lastError: d.lastError,
      contentHash: d.contentHash,
      targetPath: d.target?.documentPath ?? null,
      workspaceSlug: d.target?.workspaceSlug ?? null,
    })),
  };
}

export async function getDocument(id: string) {
  const d = await prisma.sourcePage.findUnique({
    where: { id },
    include: { target: true },
  });
  if (!d) {
    throw new AppError("NOT_FOUND", "Document introuvable", 404);
  }
  const events = await prisma.syncEvent.findMany({
    where: { sourcePageId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return {
    id: d.id,
    sourceKey: d.sourceKey,
    bookstackId: d.bookstackId,
    title: d.title,
    bookId: d.bookId,
    bookName: d.bookName,
    chapterId: d.chapterId,
    chapterName: d.chapterName,
    sourceUrl: d.sourceUrl,
    sourceUpdatedAt: d.sourceUpdatedAt?.toISOString() ?? null,
    lastSyncAt: d.lastSyncAt?.toISOString() ?? null,
    state: d.state,
    lastError: d.lastError,
    contentHash: d.contentHash,
    target: d.target
      ? {
          documentPath: d.target.documentPath,
          workspaceSlug: d.target.workspaceSlug,
          publishedHash: d.target.publishedHash,
          indexedAt: d.target.indexedAt?.toISOString() ?? null,
          ownership: d.target.ownership,
        }
      : null,
    recentEvents: events.map((e) => ({
      id: e.id,
      runId: e.runId,
      action: e.action,
      status: e.status,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function listSyncRuns(query: {
  page?: string;
  pageSize?: string;
  status?: string;
}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(query.pageSize) || PAGE_SIZE_DEFAULT));
  const where = query.status ? { status: query.status } : {};

  const [total, items] = await Promise.all([
    prisma.syncRun.count({ where }),
    prisma.syncRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    page,
    pageSize,
    total,
    items: items.map((r) => {
      let counters: Record<string, number> = {};
      try {
        counters = JSON.parse(r.countersJson) as Record<string, number>;
      } catch {
        counters = {};
      }
      return {
        id: r.id,
        type: r.type,
        trigger: r.trigger,
        actor: r.actor,
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        durationMs:
          r.finishedAt != null ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
        progressDone: r.progressDone,
        progressTotal: r.progressTotal,
        phase: r.phase,
        counters,
        errorSummary: r.errorSummary,
      };
    }),
  };
}

export async function getSyncRun(id: string) {
  const run = await prisma.syncRun.findUnique({ where: { id } });
  if (!run) {
    throw new AppError("NOT_FOUND", "Exécution introuvable", 404);
  }
  const events = await prisma.syncEvent.findMany({
    where: { runId: id },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  let counters: Record<string, number> = {};
  try {
    counters = JSON.parse(run.countersJson) as Record<string, number>;
  } catch {
    counters = {};
  }
  return {
    id: run.id,
    type: run.type,
    trigger: run.trigger,
    actor: run.actor,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs:
      run.finishedAt != null ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
    progressDone: run.progressDone,
    progressTotal: run.progressTotal,
    phase: run.phase,
    counters,
    errorSummary: run.errorSummary,
    events: events.map((e) => ({
      id: e.id,
      sourcePageId: e.sourcePageId,
      action: e.action,
      status: e.status,
      message: e.message,
      diagnosticCode: e.diagnosticCode,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function listRemovals() {
  const items = await prisma.pendingRemoval.findMany({
    where: { decision: null },
    orderBy: { detectedAt: "desc" },
  });
  const withPages = await Promise.all(
    items.map(async (r) => {
      const page = await prisma.sourcePage.findUnique({ where: { id: r.sourcePageId } });
      return {
        id: r.id,
        sourcePageId: r.sourcePageId,
        reason: r.reason,
        detectedAt: r.detectedAt.toISOString(),
        title: page?.title ?? null,
        bookName: page?.bookName ?? null,
        bookstackId: page?.bookstackId ?? null,
      };
    }),
  );
  return { items: withPages };
}

