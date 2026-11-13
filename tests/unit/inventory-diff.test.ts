import { describe, expect, it } from "vitest";
import { canAcquireLock, diffInventory, nextLease } from "@bookstack-sync/sync-engine";
import type { LocalPageRef, RemotePageRef } from "@bookstack-sync/sync-engine";

function remote(partial: Partial<RemotePageRef> & { bookstackId: number }): RemotePageRef {
  return {
    title: `Page ${partial.bookstackId}`,
    bookId: 1,
    bookName: "Livre",
    bookSlug: "livre",
    chapterId: null,
    chapterName: null,
    pageSlug: `p-${partial.bookstackId}`,
    sourceUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    draft: false,
    ...partial,
  };
}

describe("diffInventory", () => {
  it("détecte créations, mises à jour et absents", () => {
    const remotes = [
      remote({ bookstackId: 1 }),
      remote({ bookstackId: 2, sourceUpdatedAt: new Date("2026-02-01T00:00:00Z") }),
      remote({ bookstackId: 3, draft: true }),
    ];

    const locals = new Map<number, LocalPageRef>([
      [
        2,
        {
          id: "local-2",
          sourceKey: "bookstack:doc:page:2",
          bookstackId: 2,
          contentHash: "abc",
          sourceUpdatedAt: new Date("2026-01-01T00:00:00Z"),
          state: "SYNCED",
          hasTarget: true,
        },
      ],
      [
        9,
        {
          id: "local-9",
          sourceKey: "bookstack:doc:page:9",
          bookstackId: 9,
          contentHash: "xyz",
          sourceUpdatedAt: new Date("2026-01-01T00:00:00Z"),
          state: "SYNCED",
          hasTarget: true,
        },
      ],
    ]);

    const diff = diffInventory(remotes, locals);
    expect(diff.counts.create).toBe(1);
    expect(diff.counts.update).toBe(1);
    expect(diff.counts.skipDraft).toBe(1);
    expect(diff.missingLocalIds).toEqual(["local-9"]);
  });

  it("ne réindexe pas si inchangé avec cible", () => {
    const remotes = [remote({ bookstackId: 1 })];
    const locals = new Map<number, LocalPageRef>([
      [
        1,
        {
          id: "local-1",
          sourceKey: "bookstack:doc:page:1",
          bookstackId: 1,
          contentHash: "abc",
          sourceUpdatedAt: new Date("2026-01-01T00:00:00Z"),
          state: "SYNCED",
          hasTarget: true,
        },
      ],
    ]);
    const diff = diffInventory(remotes, locals);
    expect(diff.counts.unchanged).toBe(1);
    expect(diff.counts.update).toBe(0);
  });
});

describe("job lock", () => {
  it("autorise reprise si bail expiré", () => {
    const lease = nextLease("other", 1000, new Date(0));
    expect(
      canAcquireLock({
        existing: lease,
        owner: "me",
        now: new Date(10_000),
      }),
    ).toBe(true);
  });

  it("refuse si bail actif d'un autre owner", () => {
    const lease = nextLease("other", 60_000, new Date());
    expect(canAcquireLock({ existing: lease, owner: "me" })).toBe(false);
  });
});
