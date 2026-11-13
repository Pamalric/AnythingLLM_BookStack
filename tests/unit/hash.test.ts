import { describe, expect, it } from "vitest";
import { contentHash, normalizeMarkdownForHash, sha256Hex } from "@bookstack-sync/sync-engine";

describe("content hash", () => {
  it("est déterministe", () => {
    const a = contentHash("# Hello\n", "title=Hello");
    const b = contentHash("# Hello\n", "title=Hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalise les retours chariot", () => {
    expect(normalizeMarkdownForHash("a\r\nb\r\n")).toBe("a\nb\n");
  });

  it("change si métadonnées changent", () => {
    expect(contentHash("body", "t=1")).not.toBe(contentHash("body", "t=2"));
  });

  it("sha256 Hex stable", () => {
    expect(sha256Hex("x")).toBe(sha256Hex("x"));
  });
});
