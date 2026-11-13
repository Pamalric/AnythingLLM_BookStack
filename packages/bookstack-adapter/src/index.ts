/**
 * Client BookStack — contrat instance v23.10.2 (lot 0) + inventaire (lot 3).
 */

export type BookStackAuth = {
  tokenId: string;
  tokenSecret: string;
};

export type BookStackClientOptions = {
  baseUrl: string;
  auth: BookStackAuth;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  pageSize?: number;
};

export type BookStackProbeResult = {
  ok: boolean;
  status?: number;
  message: string;
  totalPages?: number;
};

export type BookStackListItem = {
  id: number;
  name: string;
  slug?: string;
  book_id?: number;
  chapter_id?: number;
  book_slug?: string;
  updated_at?: string;
  created_at?: string;
  draft?: boolean;
};

export type BookStackPageDetail = BookStackListItem & {
  html?: string;
  markdown?: string;
  raw_html?: string;
};

export type ListingResult<T> = {
  data: T[];
  total: number;
};

export class BookStackHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "BookStackHttpError";
  }
}

export class BookStackClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly pageSize: number;

  constructor(private readonly options: BookStackClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.pageSize = Math.min(500, Math.max(1, options.pageSize ?? 100));
  }

  authorizationHeader(): string {
    return `Token ${this.options.auth.tokenId}:${this.options.auth.tokenSecret}`;
  }

  healthPath(): string {
    return `${this.baseUrl}/api/pages?count=1`;
  }

  async probeConnection(): Promise<BookStackProbeResult> {
    try {
      const body = await this.getJson<{ total?: number }>(`/api/pages?count=1`);
      const total = typeof body.total === "number" ? body.total : undefined;
      if (total !== undefined) {
        return {
          ok: true,
          status: 200,
          message: `Connexion OK — ${total} page(s) visibles pour ce compte`,
          totalPages: total,
        };
      }
      return { ok: true, status: 200, message: "Connexion OK" };
    } catch (err) {
      if (err instanceof BookStackHttpError) {
        if (err.status === 401 || err.status === 403) {
          return {
            ok: false,
            status: err.status,
            message: "Authentification BookStack refusée (token ou permissions)",
          };
        }
        return {
          ok: false,
          status: err.status,
          message: `BookStack a répondu HTTP ${err.status}`,
        };
      }
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Délai dépassé lors de l'appel BookStack"
          : err instanceof Error
            ? `Erreur réseau BookStack: ${err.message}`
            : "Erreur réseau BookStack";
      return { ok: false, message };
    }
  }

  async listAllPages(): Promise<ListingResult<BookStackListItem>> {
    return this.listAll<BookStackListItem>("/api/pages");
  }

  async listAllBooks(): Promise<ListingResult<BookStackListItem>> {
    return this.listAll<BookStackListItem>("/api/books");
  }

  async listAllChapters(): Promise<ListingResult<BookStackListItem>> {
    return this.listAll<BookStackListItem>("/api/chapters");
  }

  async getPage(id: number): Promise<BookStackPageDetail> {
    return this.getJson<BookStackPageDetail>(`/api/pages/${id}`);
  }

  /** Export Markdown (texte brut, pas forcément JSON). */
  async exportPageMarkdown(id: number): Promise<string> {
    const res = await this.request(`/api/pages/${id}/export/markdown`, {
      Accept: "text/markdown, text/plain, */*",
    });
    return res.text();
  }

  /**
   * Pagination complète jusqu'à `total`.
   * Lève si inventaire incohérent (réponses incomplètes).
   */
  async listAll<T>(path: string): Promise<ListingResult<T>> {
    const all: T[] = [];
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
      const sep = path.includes("?") ? "&" : "?";
      const page = await this.getJson<{ data?: T[]; total?: number }>(
        `${path}${sep}count=${this.pageSize}&offset=${offset}`,
      );
      if (!Array.isArray(page.data) || typeof page.total !== "number") {
        throw new BookStackHttpError(
          `Réponse de listing invalide pour ${path}`,
          502,
          JSON.stringify(page).slice(0, 500),
        );
      }
      total = page.total;
      all.push(...page.data);
      if (page.data.length === 0) {
        break;
      }
      offset += page.data.length;
      if (page.data.length < this.pageSize && offset < total) {
        throw new BookStackHttpError(
          `Pagination incomplète pour ${path}: offset=${offset}, total=${total}, pageSize=${page.data.length}`,
          502,
        );
      }
    }

    if (all.length !== total) {
      throw new BookStackHttpError(
        `Inventaire incohérent pour ${path}: collecté=${all.length}, total=${total}`,
        502,
      );
    }

    return { data: all, total };
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.request(path, { Accept: "application/json" });
    return (await res.json()) as T;
  }

  private async request(path: string, acceptHeaders: Record<string, string>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: this.authorizationHeader(),
          ...acceptHeaders,
        },
        redirect: "error",
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new BookStackHttpError(`HTTP ${res.status} ${path}`, res.status, body.slice(0, 500));
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
