import { createHash } from "node:crypto";

/**
 * Moteur de synchronisation — orchestration complète : lots 3–5.
 * Lot 1 : utilitaires déterministes testables.
 */

export function normalizeMarkdownForHash(input: string): string {
  return input.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function contentHash(markdown: string, metadataCanonical: string): string {
  const normalized = normalizeMarkdownForHash(markdown);
  return sha256Hex(`${metadataCanonical}\n---\n${normalized}`);
}
