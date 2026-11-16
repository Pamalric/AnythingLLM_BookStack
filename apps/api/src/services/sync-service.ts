import { randomUUID } from "node:crypto";
import { AnythingLlmClient } from "@bookstack-sync/anythingllm-adapter";
import { BookStackClient, BookStackHttpError } from "@bookstack-sync/bookstack-adapter";
import {
  AppError,
  buildSourceKey,
  validateAllowedUrl,
} from "@bookstack-sync/shared";
import {
  CONNECTOR_FOLDER,
  buildMetadataCanonical,
  buildSourcePageUrl,
  buildChunkSource,
  buildUploadMarkdown,
  buildUploadFilename,
  CITATION_SCHEME,
  canAcquireLock,
  contentHash,
  diffInventory,
  emptyCounters,
  nextLease,
  SYNC_LOCK_KEY,
  DEFAULT_LEASE_MS,
  type LocalPageRef,
  type RemotePageRef,
  type SyncCounters,
} from "@bookstack-sync/sync-engine";
import type { AppConfig } from "../config.js";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { SecretsVault } from "../secrets/vault.js";

export type StartSyncInput = {
  type: "incremental" | "full" | "dry-run" | "document";
  trigger: "MANUAL" | "SCHEDULED" | "DOCUMENT" | "RECONCILIATION" | "DRY_RUN";
  actor: string;
  sourcePageId?: string;
};

type RunContext = {
  runId: string;
  dryRun: boolean;
  type: StartSyncInput["type"];
  actor: string;
  sourcePageId?: string;
  lockOwner: string;
  counters: SyncCounters;
};

export function createSyncService(config: AppConfig) {
  const vault = new SecretsVault({
    masterKey: config.SECRETS_MASTER_KEY,
    secretsFilePath: config.secretsFilePath,
    env: process.env,
  });

  return {
    async startSyncRun(input: StartSyncInput) {
      if (input.type === "document" && !input.sourcePageId) {
        throw new AppError("VALIDATION_ERROR", "sourcePageId requis pour une sync document", 400);
      }

      const settings = await ensureSettings();
      const dryRun = input.type === "dry-run" || input.trigger === "DRY_RUN";
      if (!dryRun && !settings.workspaceSlug) {
        throw new AppError(
          "WORKSPACE_REQUIRED",
          "Configurez un workspace AnythingLLM avant de synchroniser.",
          400,
        );
      }

      const lockOwner = `sync-${randomUUID()}`;
      await acquireLock(lockOwner);

      const running = await prisma.syncRun.findFirst({ where: { status: "RUNNING" } });
      if (running) {
        await releaseLock(lockOwner);
        throw new AppError(
          "SYNC_ALREADY_RUNNING",
          "Une synchronisation est déjà en cours.",
          409,
          { runId: running.id },
        );
      }

      const run = await prisma.syncRun.create({
        data: {
          type: dryRun ? "dry-run" : input.type,
          trigger: dryRun && input.trigger === "MANUAL" ? "DRY_RUN" : input.trigger,
          actor: input.actor,
          status: "RUNNING",
          phase: "starting",
          countersJson: JSON.stringify(emptyCounters()),
        },
      });

      await prisma.auditEvent.create({
        data: {
          actor: input.actor,
          action: "sync.start",
          entity: "SyncRun",
          details: JSON.stringify({
            runId: run.id,
            type: run.type,
            trigger: run.trigger,
            sourcePageId: input.sourcePageId ?? null,
          }),
        },
      });

      const ctx: RunContext = {
        runId: run.id,
        dryRun,
        type: dryRun ? "dry-run" : input.type,
        actor: input.actor,
        lockOwner,
        counters: emptyCounters(),
        ...(input.sourcePageId ? { sourcePageId: input.sourcePageId } : {}),
      };

      void executeRun(config, vault, ctx).catch(async (err) => {
        logger.error({ err, runId: run.id }, "Sync run crashed");
        await failRun(run.id, err instanceof Error ? err.message : "Erreur inconnue");
        await releaseLock(lockOwner).catch(() => undefined);
      });

      return { id: run.id, status: "RUNNING" as const };
    },

    async approveRemoval(id: string, actor: string) {
      return decideRemoval(config, vault, id, actor, "approve");
    },

    async rejectRemoval(id: string, actor: string) {
      return decideRemoval(config, vault, id, actor, "reject");
    },
  };
}

export type SyncService = ReturnType<typeof createSyncService>;

async function executeRun(
  config: AppConfig,
  vault: SecretsVault,
  ctx: RunContext,
): Promise<void> {
  try {
    await setPhase(ctx.runId, "probing", 0, 0);
    const clients = await buildClients(config, vault, { requireAnythingllm: !ctx.dryRun });

    const bsProbe = await clients.bookstack.probeConnection();
    if (!bsProbe.ok) {
      throw new AppError("BOOKSTACK_UNAVAILABLE", bsProbe.message, 502);
    }

    if (clients.anythingllm) {
      const allProbe = await clients.anythingllm.probeConnection();
      if (!allProbe.ok && !ctx.dryRun) {
        throw new AppError("ANYTHINGLLM_UNAVAILABLE", allProbe.message, 502);
      }
    }

    if (ctx.type === "document" && ctx.sourcePageId) {
      await runDocumentSync(config, clients, ctx);
    } else {
      await runInventorySync(config, clients, ctx);
    }

    await heartbeat(ctx.lockOwner);
    await finishRun(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    await failRun(ctx.runId, message);
    throw err;
  } finally {
    await releaseLock(ctx.lockOwner).catch(() => undefined);
  }
}

async function runInventorySync(
  config: AppConfig,
  clients: Clients,
  ctx: RunContext,
): Promise<void> {
  const settings = await ensureSettings();
  await setPhase(ctx.runId, "inventory", 0, 0);

  const citationUpgradeNeeded = settings.citationScheme !== CITATION_SCHEME;
  if (citationUpgradeNeeded && !ctx.dryRun) {
    const marked = await prisma.sourcePage.updateMany({
      where: {
        state: { in: ["SYNCED", "ERROR"] },
        target: { isNot: null },
      },
      data: { state: "OUTDATED" },
    });
    if (marked.count > 0) {
      await addEvent(ctx.runId, null, "CITATION_UPGRADE", "SUCCESS", {
        message: `Réindexation citations (${CITATION_SCHEME}) : ${marked.count} document(s) marqué(s) OUTDATED`,
      });
    }
  }

  let inventoryComplete = false;
  let remotePages: RemotePageRef[] = [];

  try {
    const [pagesListing, booksListing, chaptersListing] = await Promise.all([
      clients.bookstack.listAllPages(),
      clients.bookstack.listAllBooks(),
      clients.bookstack.listAllChapters(),
    ]);

    const booksById = new Map(booksListing.data.map((b) => [b.id, b]));
    const chaptersById = new Map(chaptersListing.data.map((c) => [c.id, c]));

    remotePages = pagesListing.data.map((p) => {
      const book = p.book_id != null ? booksById.get(p.book_id) : undefined;
      const chapterId = p.chapter_id && p.chapter_id > 0 ? p.chapter_id : null;
      const chapter = chapterId != null ? chaptersById.get(chapterId) : undefined;
      return {
        bookstackId: p.id,
        title: p.name,
        bookId: p.book_id ?? null,
        bookName: book?.name ?? null,
        bookSlug: book?.slug ?? p.book_slug ?? null,
        chapterId,
        chapterName: chapter?.name ?? null,
        pageSlug: p.slug ?? null,
        sourceUpdatedAt: p.updated_at ? new Date(p.updated_at) : null,
        draft: Boolean(p.draft),
      };
    });

    inventoryComplete = true;
    await addEvent(ctx.runId, null, "INVENTORY", "SUCCESS", {
      message: `Inventaire complet : ${pagesListing.total} page(s), ${booksListing.total} livre(s), ${chaptersListing.total} chapitre(s)`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inventaire échoué";
    await addEvent(ctx.runId, null, "INVENTORY", "FAILED", {
      message,
      diagnosticCode: "INVENTORY_INCOMPLETE",
    });
    throw new AppError("INVENTORY_INCOMPLETE", message, 502);
  }

  const locals = await prisma.sourcePage.findMany({ include: { target: true } });
  const localByBs = new Map<number, LocalPageRef>();
  for (const l of locals) {
    localByBs.set(l.bookstackId, {
      id: l.id,
      sourceKey: l.sourceKey,
      bookstackId: l.bookstackId,
      contentHash: l.contentHash,
      sourceUpdatedAt: l.sourceUpdatedAt,
      state: l.state,
      hasTarget: Boolean(l.target),
    });
  }

  const diff = diffInventory(remotePages, localByBs);
  const toProcess = remotePages.filter((p) => {
    const d = diff.decisions.find((x) => x.bookstackId === p.bookstackId);
    return d && (d.action === "CREATE" || d.action === "UPDATE" || d.action === "REHASH");
  });

  await setPhase(ctx.runId, "hashing", 0, toProcess.length + remotePages.length);

  const now = new Date();
  let done = 0;

  // Upsert métadonnées pour toutes les pages non-draft
  for (const page of remotePages) {
    await heartbeat(ctx.lockOwner);
    if (page.draft) {
      done += 1;
      await setPhase(ctx.runId, "hashing", done, remotePages.length + toProcess.length);
      continue;
    }

    const sourceKey = buildSourceKey(settings.bookstackInstanceId, page.bookstackId);
    const sourceUrl = buildSourcePageUrl({
      bookstackBaseUrl: settings.bookstackBaseUrl,
      bookSlug: page.bookSlug,
      pageSlug: page.pageSlug,
      pageId: page.bookstackId,
    });

    const existing = await prisma.sourcePage.findUnique({ where: { sourceKey } });
    if (existing) {
      await prisma.sourcePage.update({
        where: { id: existing.id },
        data: {
          title: page.title,
          bookId: page.bookId,
          bookName: page.bookName,
          chapterId: page.chapterId,
          chapterName: page.chapterName,
          sourceUrl,
          sourceUpdatedAt: page.sourceUpdatedAt,
          lastSeenAt: now,
          state:
            existing.state === "PENDING_REMOVAL" || existing.state === "ACCESS_REVIEW"
              ? "OUTDATED"
              : existing.state === "REMOVED"
                ? "NEW"
                : existing.state,
        },
      });
    } else {
      await prisma.sourcePage.create({
        data: {
          sourceKey,
          bookstackId: page.bookstackId,
          title: page.title,
          bookId: page.bookId,
          bookName: page.bookName,
          chapterId: page.chapterId,
          chapterName: page.chapterName,
          sourceUrl,
          sourceUpdatedAt: page.sourceUpdatedAt,
          lastSeenAt: now,
          state: "NEW",
        },
      });
    }
    done += 1;
    if (done % 10 === 0) {
      await setPhase(ctx.runId, "hashing", done, remotePages.length + toProcess.length);
    }
  }

  await setPhase(ctx.runId, ctx.dryRun ? "dry-run" : "indexing", done, remotePages.length + toProcess.length);

  for (const page of toProcess) {
    await heartbeat(ctx.lockOwner);
    const sourceKey = buildSourceKey(settings.bookstackInstanceId, page.bookstackId);
    const local = await prisma.sourcePage.findUnique({
      where: { sourceKey },
      include: { target: true },
    });
    if (!local) continue;

    try {
      await processPage(config, clients, ctx, local.id, settings.workspaceSlug);
    } catch (err) {
      ctx.counters.errors += 1;
      const message = err instanceof Error ? err.message : "Erreur page";
      await prisma.sourcePage.update({
        where: { id: local.id },
        data: { state: "ERROR", lastError: message.slice(0, 1000) },
      });
      await addEvent(ctx.runId, local.id, "SYNC_PAGE", "FAILED", { message });
    }
    done += 1;
    await setPhase(
      ctx.runId,
      ctx.dryRun ? "dry-run" : "indexing",
      done,
      remotePages.length + toProcess.length,
    );
    await persistCounters(ctx);
  }

  // Pages UNCHANGED
  ctx.counters.unchanged += diff.counts.unchanged;
  ctx.counters.skipped += diff.counts.skipDraft;

  if (inventoryComplete) {
    await setPhase(ctx.runId, "removals", done, remotePages.length + toProcess.length);
    for (const localId of diff.missingLocalIds) {
      const page = await prisma.sourcePage.findUnique({ where: { id: localId } });
      if (!page || page.state === "PENDING_REMOVAL" || page.state === "REMOVED") continue;

      if (ctx.dryRun) {
        ctx.counters.proposedRemovals += 1;
        await addEvent(ctx.runId, localId, "PROPOSE_REMOVAL", "DRY_RUN", {
          message: "Serait proposé au retrait (page absente de l'inventaire)",
        });
        continue;
      }

      await prisma.sourcePage.update({
        where: { id: localId },
        data: { state: "PENDING_REMOVAL" },
      });
      await prisma.pendingRemoval.create({
        data: {
          sourcePageId: localId,
          reason: "Absent de l'inventaire BookStack complet",
        },
      });
      ctx.counters.proposedRemovals += 1;
      await addEvent(ctx.runId, localId, "PROPOSE_REMOVAL", "SUCCESS", {
        message: "Page absente de l'inventaire — en attente d'approbation",
      });
    }
  }

  await persistCounters(ctx);

  if (citationUpgradeNeeded && !ctx.dryRun && ctx.counters.errors === 0) {
    await prisma.settings.update({
      where: { id: 1 },
      data: { citationScheme: CITATION_SCHEME },
    });
    await addEvent(ctx.runId, null, "CITATION_UPGRADE", "SUCCESS", {
      message: `Schéma de citation publié : ${CITATION_SCHEME}`,
    });
  }
}

async function runDocumentSync(
  config: AppConfig,
  clients: Clients,
  ctx: RunContext,
): Promise<void> {
  const settings = await ensureSettings();
  if (!ctx.sourcePageId) {
    throw new AppError("VALIDATION_ERROR", "sourcePageId manquant", 400);
  }
  await setPhase(ctx.runId, "document", 0, 1);
  await processPage(config, clients, ctx, ctx.sourcePageId, settings.workspaceSlug);
  await setPhase(ctx.runId, "document", 1, 1);
  await persistCounters(ctx);
}

async function processPage(
  _config: AppConfig,
  clients: Clients,
  ctx: RunContext,
  sourcePageId: string,
  workspaceSlug: string | null,
): Promise<void> {
  const page = await prisma.sourcePage.findUnique({
    where: { id: sourcePageId },
    include: { target: true },
  });
  if (!page) {
    throw new AppError("NOT_FOUND", "Document introuvable", 404);
  }

  await prisma.sourcePage.update({
    where: { id: page.id },
    data: { state: "PROCESSING", lastError: null },
  });

  let markdown: string;
  try {
    markdown = await clients.bookstack.exportPageMarkdown(page.bookstackId);
  } catch (err) {
    if (err instanceof BookStackHttpError && (err.status === 403 || err.status === 404)) {
      await prisma.sourcePage.update({
        where: { id: page.id },
        data: {
          state: "ACCESS_REVIEW",
          lastError: `BookStack HTTP ${err.status}`,
        },
      });
      await addEvent(ctx.runId, page.id, "EXPORT", "FAILED", {
        message: `Accès page refusé/absent (HTTP ${err.status}) — ACCESS_REVIEW`,
        diagnosticCode: "ACCESS_REVIEW",
      });
      ctx.counters.errors += 1;
      return;
    }
    throw err;
  }

  const sourceUrl = page.sourceUrl ?? "";
  const uploadBody = buildUploadMarkdown(markdown, sourceUrl);
  const meta = buildMetadataCanonical({
    title: page.title,
    sourceKey: page.sourceKey,
    sourceUrl,
    bookName: page.bookName,
    chapterName: page.chapterName,
  });
  const hash = contentHash(uploadBody, meta);

  if (page.contentHash === hash && page.target && page.state !== "ERROR") {
    await prisma.sourcePage.update({
      where: { id: page.id },
      data: {
        state: "SYNCED",
        contentHash: hash,
        lastSyncAt: new Date(),
        lastError: null,
      },
    });
    ctx.counters.unchanged += 1;
    await addEvent(ctx.runId, page.id, "SYNC_PAGE", "SUCCESS", {
      message: "Contenu inchangé (hash identique) — pas de réindexation",
    });
    return;
  }

  const isCreate = !page.target;

  if (ctx.dryRun) {
    if (isCreate) ctx.counters.dryRunWouldAdd += 1;
    else ctx.counters.dryRunWouldUpdate += 1;
    await prisma.sourcePage.update({
      where: { id: page.id },
      data: {
        contentHash: hash,
        state: isCreate ? "NEW" : "OUTDATED",
      },
    });
    await addEvent(ctx.runId, page.id, "SYNC_PAGE", "DRY_RUN", {
      message: isCreate
        ? "Dry-run : serait ajouté dans AnythingLLM"
        : "Dry-run : serait mis à jour dans AnythingLLM",
    });
    return;
  }

  if (!workspaceSlug) {
    throw new AppError("WORKSPACE_REQUIRED", "Workspace AnythingLLM non configuré", 400);
  }
  if (!clients.anythingllm) {
    throw new AppError("CREDENTIALS_MISSING", "Client AnythingLLM indisponible", 400);
  }

  const filename = buildUploadFilename(page.bookstackId, page.title);
  const uploaded = await clients.anythingllm.uploadMarkdown({
    folderName: CONNECTOR_FOLDER,
    filename,
    content: uploadBody,
    title: page.title,
    docSource: sourceUrl || page.sourceKey,
    ...(sourceUrl ? { chunkSource: buildChunkSource(sourceUrl) } : {}),
    description: `BookStack ${page.sourceKey}`,
  });

  await clients.anythingllm.updateEmbeddings({
    slug: workspaceSlug,
    adds: [uploaded.location],
    deletes: [],
  });

  const oldPath = page.target?.documentPath ?? null;

  if (oldPath && oldPath !== uploaded.location) {
    await clients.anythingllm.updateEmbeddings({
      slug: workspaceSlug,
      adds: [],
      deletes: [oldPath],
    });
    try {
      await clients.anythingllm.removeDocuments([oldPath]);
    } catch (err) {
      logger.warn({ err, oldPath }, "remove-documents ancienne version — non bloquant");
    }
  }

  await prisma.targetDocument.upsert({
    where: { sourcePageId: page.id },
    create: {
      sourcePageId: page.id,
      workspaceSlug,
      documentPath: uploaded.location,
      publishedHash: hash,
      indexedAt: new Date(),
      ownership: "CONNECTOR_OWNED",
    },
    update: {
      workspaceSlug,
      documentPath: uploaded.location,
      publishedHash: hash,
      indexedAt: new Date(),
      ownership: "CONNECTOR_OWNED",
    },
  });

  await prisma.sourcePage.update({
    where: { id: page.id },
    data: {
      contentHash: hash,
      state: "SYNCED",
      lastSyncAt: new Date(),
      lastError: null,
    },
  });

  if (isCreate) ctx.counters.added += 1;
  else ctx.counters.updated += 1;

  await addEvent(ctx.runId, page.id, isCreate ? "ADD" : "UPDATE", "SUCCESS", {
    message: `Indexé → ${uploaded.location}`,
  });
}

type Clients = {
  bookstack: BookStackClient;
  anythingllm: AnythingLlmClient | null;
};

async function buildClients(
  config: AppConfig,
  vault: SecretsVault,
  opts: { requireAnythingllm: boolean } = { requireAnythingllm: true },
): Promise<Clients> {
  const settings = await ensureSettings();
  const { secrets, sources } = await vault.resolve();

  const bsUrl = validateAllowedUrl(settings.bookstackBaseUrl, config.allowedBookstackHosts);
  if (!bsUrl.ok) throw new AppError(bsUrl.code, bsUrl.message, 400);

  if (sources.bookstackToken === "none" || !secrets.bookstackTokenId || !secrets.bookstackTokenSecret) {
    throw new AppError("CREDENTIALS_MISSING", "Token BookStack non configuré", 400);
  }

  const bookstack = new BookStackClient({
    baseUrl: settings.bookstackBaseUrl,
    auth: {
      tokenId: secrets.bookstackTokenId,
      tokenSecret: secrets.bookstackTokenSecret,
    },
  });

  if (sources.anythingllmApiKey === "none" || !secrets.anythingllmApiKey) {
    if (opts.requireAnythingllm) {
      throw new AppError("CREDENTIALS_MISSING", "Clé API AnythingLLM non configurée", 400);
    }
    return { bookstack, anythingllm: null };
  }

  const allUrl = validateAllowedUrl(settings.anythingllmBaseUrl, config.allowedAnythingllmHosts, {
    allowHttpHosts: config.allowedAnythingllmHosts.filter((h) => h === "anythingllm"),
  });
  if (!allUrl.ok) throw new AppError(allUrl.code, allUrl.message, 400);

  const anythingllm = new AnythingLlmClient({
    baseUrl: settings.anythingllmBaseUrl,
    apiKey: secrets.anythingllmApiKey,
  });

  return { bookstack, anythingllm };
}

async function decideRemoval(
  config: AppConfig,
  vault: SecretsVault,
  id: string,
  actor: string,
  decision: "approve" | "reject",
) {
  const removal = await prisma.pendingRemoval.findUnique({ where: { id } });
  if (!removal || removal.decision) {
    throw new AppError("NOT_FOUND", "Retrait introuvable ou déjà traité", 404);
  }

  const page = await prisma.sourcePage.findUnique({
    where: { id: removal.sourcePageId },
    include: { target: true },
  });

  if (decision === "reject") {
    await prisma.pendingRemoval.update({
      where: { id },
      data: {
        decision: "rejected",
        reviewedAt: new Date(),
        reviewedBy: actor,
        decisionReason: "Rejeté par l'administrateur",
      },
    });
    if (page) {
      await prisma.sourcePage.update({
        where: { id: page.id },
        data: { state: page.target ? "SYNCED" : "NEW" },
      });
    }
    await prisma.auditEvent.create({
      data: {
        actor,
        action: "removal.reject",
        entity: "PendingRemoval",
        details: JSON.stringify({ id, sourcePageId: removal.sourcePageId }),
      },
    });
    return { id, decision: "rejected" as const };
  }

  // approve
  if (page?.target) {
    const clients = await buildClients(config, vault, { requireAnythingllm: true });
    const settings = await ensureSettings();
    if (settings.workspaceSlug && clients.anythingllm) {
      await clients.anythingllm.updateEmbeddings({
        slug: settings.workspaceSlug,
        deletes: [page.target.documentPath],
      });
    }
    try {
      await clients.anythingllm?.removeDocuments([page.target.documentPath]);
    } catch (err) {
      logger.warn({ err }, "remove-documents après approbation — vérifier manuellement");
    }
    await prisma.targetDocument.delete({ where: { id: page.target.id } });
  }

  if (page) {
    await prisma.sourcePage.update({
      where: { id: page.id },
      data: { state: "REMOVED" },
    });
  }

  await prisma.pendingRemoval.update({
    where: { id },
    data: {
      decision: "approved",
      reviewedAt: new Date(),
      reviewedBy: actor,
      decisionReason: "Approuvé — retrait AnythingLLM",
    },
  });

  await prisma.auditEvent.create({
    data: {
      actor,
      action: "removal.approve",
      entity: "PendingRemoval",
      details: JSON.stringify({ id, sourcePageId: removal.sourcePageId }),
    },
  });

  return { id, decision: "approved" as const };
}

async function acquireLock(owner: string): Promise<void> {
  const existing = await prisma.jobLock.findUnique({ where: { key: SYNC_LOCK_KEY } });
  const lease = existing
    ? {
        key: existing.key,
        owner: existing.owner,
        leaseUntil: existing.leaseUntil,
        heartbeatAt: existing.heartbeatAt,
      }
    : null;

  if (!canAcquireLock({ existing: lease, owner })) {
    throw new AppError("SYNC_LOCKED", "Verrou de synchronisation actif", 409);
  }

  const next = nextLease(owner, DEFAULT_LEASE_MS);
  await prisma.jobLock.upsert({
    where: { key: SYNC_LOCK_KEY },
    create: next,
    update: {
      owner: next.owner,
      leaseUntil: next.leaseUntil,
      heartbeatAt: next.heartbeatAt,
    },
  });
}

async function heartbeat(owner: string): Promise<void> {
  const next = nextLease(owner, DEFAULT_LEASE_MS);
  await prisma.jobLock.updateMany({
    where: { key: SYNC_LOCK_KEY, owner },
    data: { leaseUntil: next.leaseUntil, heartbeatAt: next.heartbeatAt },
  });
}

async function releaseLock(owner: string): Promise<void> {
  await prisma.jobLock.deleteMany({ where: { key: SYNC_LOCK_KEY, owner } });
}

async function setPhase(
  runId: string,
  phase: string,
  progressDone: number,
  progressTotal: number,
): Promise<void> {
  await prisma.syncRun.update({
    where: { id: runId },
    data: { phase, progressDone, progressTotal },
  });
}

async function persistCounters(ctx: RunContext): Promise<void> {
  await prisma.syncRun.update({
    where: { id: ctx.runId },
    data: { countersJson: JSON.stringify(ctx.counters) },
  });
}

async function addEvent(
  runId: string,
  sourcePageId: string | null,
  action: string,
  status: string,
  opts: { message?: string; diagnosticCode?: string },
): Promise<void> {
  await prisma.syncEvent.create({
    data: {
      runId,
      sourcePageId,
      action,
      status,
      message: opts.message?.slice(0, 2000) ?? null,
      diagnosticCode: opts.diagnosticCode ?? null,
    },
  });
}

async function finishRun(ctx: RunContext): Promise<void> {
  const status =
    ctx.counters.errors > 0
      ? ctx.counters.added + ctx.counters.updated + ctx.counters.dryRunWouldAdd + ctx.counters.dryRunWouldUpdate > 0
        ? "PARTIAL"
        : "FAILED"
      : "SUCCESS";

  await prisma.syncRun.update({
    where: { id: ctx.runId },
    data: {
      status,
      finishedAt: new Date(),
      phase: "done",
      countersJson: JSON.stringify(ctx.counters),
      errorSummary:
        ctx.counters.errors > 0 ? `${ctx.counters.errors} erreur(s) document` : null,
    },
  });
}

async function failRun(runId: string, message: string): Promise<void> {
  await prisma.syncRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      phase: "failed",
      errorSummary: message.slice(0, 1000),
    },
  });
  await addEvent(runId, null, "RUN", "FAILED", { message }).catch(() => undefined);
}

async function ensureSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: 1 } });
}
