import type { DocumentState } from "@bookstack-sync/shared";

export type RemotePageRef = {
  bookstackId: number;
  title: string;
  bookId: number | null;
  bookName: string | null;
  bookSlug: string | null;
  chapterId: number | null;
  chapterName: string | null;
  pageSlug: string | null;
  sourceUpdatedAt: Date | null;
  draft: boolean;
};

export type LocalPageRef = {
  id: string;
  sourceKey: string;
  bookstackId: number;
  contentHash: string | null;
  sourceUpdatedAt: Date | null;
  state: string;
  hasTarget: boolean;
};

export type InventoryAction =
  | "CREATE"
  | "UPDATE"
  | "UNCHANGED"
  | "REHASH"
  | "SKIP_DRAFT";

export type InventoryDecision = {
  bookstackId: number;
  action: InventoryAction;
  reason: string;
  localId?: string;
};

export type InventoryDiffResult = {
  decisions: InventoryDecision[];
  missingLocalIds: string[];
  counts: {
    create: number;
    update: number;
    unchanged: number;
    rehash: number;
    skipDraft: number;
    missing: number;
  };
};

/**
 * Compare inventaire distant vs local.
 * Ne décide PAS des retraits : l'appelant ne doit appeler missing que si inventaire complet.
 */
export function diffInventory(
  remote: RemotePageRef[],
  localByBookstackId: Map<number, LocalPageRef>,
): InventoryDiffResult {
  const decisions: InventoryDecision[] = [];
  const seen = new Set<number>();
  let create = 0;
  let update = 0;
  let unchanged = 0;
  let rehash = 0;
  let skipDraft = 0;

  for (const page of remote) {
    seen.add(page.bookstackId);
    if (page.draft) {
      skipDraft += 1;
      decisions.push({
        bookstackId: page.bookstackId,
        action: "SKIP_DRAFT",
        reason: "Page brouillon ignorée",
      });
      continue;
    }

    const local = localByBookstackId.get(page.bookstackId);
    if (!local) {
      create += 1;
      decisions.push({
        bookstackId: page.bookstackId,
        action: "CREATE",
        reason: "Nouvelle page BookStack",
      });
      continue;
    }

    const remoteMs = page.sourceUpdatedAt?.getTime() ?? null;
    const localMs = local.sourceUpdatedAt?.getTime() ?? null;
    const dateChanged =
      remoteMs !== null && localMs !== null ? remoteMs !== localMs : remoteMs !== localMs;

    if (!local.contentHash) {
      rehash += 1;
      decisions.push({
        bookstackId: page.bookstackId,
        action: "REHASH",
        reason: "Hash local absent",
        localId: local.id,
      });
      continue;
    }

    if (dateChanged || local.state === "OUTDATED" || local.state === "ERROR" || local.state === "NEW") {
      update += 1;
      decisions.push({
        bookstackId: page.bookstackId,
        action: "UPDATE",
        reason: dateChanged ? "Date source modifiée" : `État local ${local.state}`,
        localId: local.id,
      });
      continue;
    }

    if (!local.hasTarget && local.state !== "PENDING_REMOVAL" && local.state !== "REMOVED") {
      update += 1;
      decisions.push({
        bookstackId: page.bookstackId,
        action: "UPDATE",
        reason: "Pas encore indexé côté AnythingLLM",
        localId: local.id,
      });
      continue;
    }

    unchanged += 1;
    decisions.push({
      bookstackId: page.bookstackId,
      action: "UNCHANGED",
      reason: "Inchangé",
      localId: local.id,
    });
  }

  const missingLocalIds: string[] = [];
  for (const [bookstackId, local] of localByBookstackId) {
    if (seen.has(bookstackId)) continue;
    if (local.state === "REMOVED") continue;
    missingLocalIds.push(local.id);
  }

  return {
    decisions,
    missingLocalIds,
    counts: {
      create,
      update,
      unchanged,
      rehash,
      skipDraft,
      missing: missingLocalIds.length,
    },
  };
}

export function nextStateAfterInventory(action: InventoryAction, current?: string): DocumentState {
  switch (action) {
    case "CREATE":
      return "NEW";
    case "UPDATE":
    case "REHASH":
      return current === "PROCESSING" ? "PROCESSING" : "OUTDATED";
    case "UNCHANGED":
      return (current as DocumentState) || "SYNCED";
    case "SKIP_DRAFT":
      return "REMOVED";
    default:
      return "NEW";
  }
}

export type SyncCounters = {
  added: number;
  updated: number;
  unchanged: number;
  errors: number;
  proposedRemovals: number;
  skipped: number;
  dryRunWouldAdd: number;
  dryRunWouldUpdate: number;
};

export function emptyCounters(): SyncCounters {
  return {
    added: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    proposedRemovals: 0,
    skipped: 0,
    dryRunWouldAdd: 0,
    dryRunWouldUpdate: 0,
  };
}
