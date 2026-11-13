export type PageMetadataInput = {
  title: string;
  sourceKey: string;
  sourceUrl: string;
  bookName: string | null;
  chapterName: string | null;
};

/** Métadonnées canoniques stables pour le hash (ordre de clés fixe). */
export function buildMetadataCanonical(meta: PageMetadataInput): string {
  return [
    `title=${meta.title}`,
    `sourceKey=${meta.sourceKey}`,
    `sourceUrl=${meta.sourceUrl}`,
    `book=${meta.bookName ?? ""}`,
    `chapter=${meta.chapterName ?? ""}`,
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
