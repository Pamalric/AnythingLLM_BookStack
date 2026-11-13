/**
 * Client AnythingLLM — endpoints issus exclusivement du Swagger Jarvis (lot 0).
 * Mutations / upload / embeddings : lot 4. Probe lecture seule : lot 2.
 */
export type AnythingLlmClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type AnythingLlmProbeResult = {
  ok: boolean;
  status?: number;
  message: string;
  workspaceCount?: number;
};

export class AnythingLlmClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: AnythingLlmClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  authorizationHeader(): string {
    return `Bearer ${this.options.apiKey}`;
  }

  /** GET /api/v1/auth — présent dans OpenAPI Jarvis. */
  authPath(): string {
    return `${this.baseUrl}/api/v1/auth`;
  }

  workspacesPath(): string {
    return `${this.baseUrl}/api/v1/workspaces`;
  }

  /** Lecture seule : auth + liste workspaces. */
  async probeConnection(): Promise<AnythingLlmProbeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const authRes = await this.fetchImpl(this.authPath(), {
        method: "GET",
        headers: {
          Authorization: this.authorizationHeader(),
          Accept: "application/json",
        },
        redirect: "error",
        signal: controller.signal,
      });

      if (authRes.status === 403 || authRes.status === 401) {
        return {
          ok: false,
          status: authRes.status,
          message: "Clé API AnythingLLM invalide ou absente",
        };
      }
      if (!authRes.ok) {
        return {
          ok: false,
          status: authRes.status,
          message: `AnythingLLM /auth a répondu HTTP ${authRes.status}`,
        };
      }

      const wsRes = await this.fetchImpl(this.workspacesPath(), {
        method: "GET",
        headers: {
          Authorization: this.authorizationHeader(),
          Accept: "application/json",
        },
        redirect: "error",
        signal: controller.signal,
      });

      if (!wsRes.ok) {
        return {
          ok: false,
          status: wsRes.status,
          message: `AnythingLLM /workspaces a répondu HTTP ${wsRes.status}`,
        };
      }

      const body = (await wsRes.json()) as { workspaces?: unknown[] };
      const count = Array.isArray(body.workspaces) ? body.workspaces.length : undefined;
      if (count !== undefined) {
        return {
          ok: true,
          status: wsRes.status,
          message: `Connexion OK — ${count} workspace(s) visible(s)`,
          workspaceCount: count,
        };
      }
      return {
        ok: true,
        status: wsRes.status,
        message: "Connexion OK",
      };
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Délai dépassé lors de l'appel AnythingLLM"
          : err instanceof Error
            ? `Erreur réseau AnythingLLM: ${err.message}`
            : "Erreur réseau AnythingLLM";
      return { ok: false, message };
    } finally {
      clearTimeout(timer);
    }
  }

  async listWorkspaceSlugs(): Promise<string[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.workspacesPath(), {
        method: "GET",
        headers: {
          Authorization: this.authorizationHeader(),
          Accept: "application/json",
        },
        redirect: "error",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as { workspaces?: Array<{ slug?: string }> };
      return (body.workspaces ?? [])
        .map((w) => w.slug)
        .filter((s): s is string => typeof s === "string" && s.length > 0);
    } finally {
      clearTimeout(timer);
    }
  }
}
