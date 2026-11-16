import { describe, expect, it } from "vitest";
import {
  buildChunkSource,
  buildMetadataCanonical,
  buildSourcePageUrl,
  buildUploadFilename,
  buildUploadMarkdown,
  CITATION_SCHEME,
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
    expect(a).toContain(`citation=${CITATION_SCHEME}`);
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

  it("prépare chunkSource et Markdown pour citations Jarvis", () => {
    const url = "https://documentation.xperteam.net/books/guide/page/intro";
    expect(buildChunkSource(url)).toBe(`link://${url}`);
    expect(buildChunkSource(`link://${url}`)).toBe(`link://${url}`);
    expect(buildUploadMarkdown("# Contenu", url)).toBe(
      `Source BookStack: ${url}\n\n# Contenu`,
    );
    expect(buildUploadMarkdown("# Contenu", "")).toBe("# Contenu");
  });
});
