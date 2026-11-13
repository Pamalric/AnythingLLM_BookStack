import { describe, expect, it } from "vitest";
import {
  buildMetadataCanonical,
  buildSourcePageUrl,
  buildUploadFilename,
  contentHash,
} from "@bookstack-sync/sync-engine";

describe("metadata + hash", () => {
  it("canonique stable", () => {
    const a = buildMetadataCanonical({
      title: "Hello",
      sourceKey: "bookstack:x:page:1",
      sourceUrl: "https://documentation.xperteam.net/link/1",
      bookName: "B",
      chapterName: null,
    });
    const b = buildMetadataCanonical({
      title: "Hello",
      sourceKey: "bookstack:x:page:1",
      sourceUrl: "https://documentation.xperteam.net/link/1",
      bookName: "B",
      chapterName: null,
    });
    expect(a).toBe(b);
    expect(contentHash("# x\n", a)).toBe(contentHash("# x\r\n", b));
  });

  it("construit URL et nom de fichier", () => {
    expect(
      buildSourcePageUrl({
        bookstackBaseUrl: "https://documentation.xperteam.net/",
        bookSlug: "guide",
        pageSlug: "intro",
        pageId: 12,
      }),
    ).toBe("https://documentation.xperteam.net/books/guide/page/intro");

    expect(buildUploadFilename(12, "Hello World!")).toBe("bs-12-hello-world.md");
  });
});
