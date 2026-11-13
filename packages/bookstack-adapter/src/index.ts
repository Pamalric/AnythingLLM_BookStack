/**
 * Client BookStack — contrat confirmé lot 0 (docs instance v23.10.2).
 * Inventaire complet : lot 3. Probe lecture seule : lot 2.
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
};

export type BookStackProbeResult = {
  ok: boolean;
  status?: number;
  message: string;
  totalPages?: number;
};

export class BookStackClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: BookStackClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** En-tête Token attendu par BookStack. */
  authorizationHeader(): string {
    return `Token ${this.options.auth.tokenId}:${this.options.auth.tokenSecret}`;
  }

  healthPath(): string {
    return `${this.baseUrl}/api/pages?count=1`;
  }

  /** Lecture seule : vérifie auth + pagination (total). */
  async probeConnection(): Promise<BookStackProbeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.healthPath(), {
        method: "GET",
        headers: {
          Authorization: this.authorizationHeader(),
          Accept: "application/json",
        },
        redirect: "error",
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          message: "Authentification BookStack refusée (token ou permissions)",
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          message: `BookStack a répondu HTTP ${res.status}`,
        };
      }

      const body = (await res.json()) as { total?: unknown };
      const total = typeof body.total === "number" ? body.total : undefined;
      if (total !== undefined) {
        return {
          ok: true,
          status: res.status,
          message: `Connexion OK — ${total} page(s) visibles pour ce compte`,
          totalPages: total,
        };
      }
      return {
        ok: true,
        status: res.status,
        message: "Connexion OK",
      };
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Délai dépassé lors de l'appel BookStack"
          : err instanceof Error
            ? `Erreur réseau BookStack: ${err.message}`
            : "Erreur réseau BookStack";
      return { ok: false, message };
    } finally {
      clearTimeout(timer);
    }
  }
}
