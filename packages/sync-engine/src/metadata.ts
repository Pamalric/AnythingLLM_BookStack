export type PageMetadataInput = {
  title: string;
  sourceKey: string;
  sourceUrl: string;
  bookName: string | null;
  chapterName: string | null;
};

/**
 * Schéma de citation AnythingLLM.
 * `link-v1` = métadonnée `chunkSource: link://<url>` pour liens cliquables dans le chat.
 * Incrémenter si le format d'upload citation change (invalide les hash → réindexation).
 */
export const CITATION_SCHEME = "link-v1";

/** Métadonnées canoniques stables pour le hash (ordre de clés fixe). */
export function buildMetadataCanonical(meta: PageMetadataInput): string {
  return [
    `title=${meta.title}`,
    `sourceKey=${meta.sourceKey}`,
    `sourceUrl=${meta.sourceUrl}`,
    `book=${meta.bookName ?? ""}`,
    `chapter=${meta.chapterName ?? ""}`,
    `citation=${CITATION_SCHEME}`,
  ].join("\n");
}

export function buildSourcePageUrl(params: {
  bookstackBaseUrl: string;
  bookSlug?: string | null;
  pageSlug?: string | null;
  pageId: number;
}): string {
  const base = params.bookstackBaseUrl.replace(/\/+$/, "");
  if (params.bookSlug && params.pageSlug) {
    return `${base}/books/${params.bookSlug}/page/${params.pageSlug}`;
  }
  return `${base}/link/${params.pageId}`;
}

/**
 * Préfixe AnythingLLM pour citations cliquables (`parseChunkSource` côté Jarvis).
 * Sans `link://`, l'UI traite la source comme un fichier local non cliquable.
 */
export function buildChunkSource(sourceUrl: string): string {
  const trimmed = sourceUrl.trim();
  if (trimmed.startsWith("link://")) return trimmed;
  return `link://${trimmed}`;
}

/** En-tête visible dans le Markdown indexé pour que le modèle puisse citer l'URL. */
export function buildUploadMarkdown(markdown: string, sourceUrl: string): string {
  const url = sourceUrl.trim();
  if (!url) return markdown;
  return [`Source BookStack: ${url}`, "", markdown.replace(/^\uFEFF/, "")].join("\n");
}

/** Nom de fichier sûr pour upload AnythingLLM. */
export function buildUploadFilename(pageId: number, title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safe = slug.length > 0 ? slug : "page";
  return `bs-${pageId}-${safe}.md`;
}

export const CONNECTOR_FOLDER = "bookstack-sync";
