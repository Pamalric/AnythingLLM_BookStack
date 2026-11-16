/**
 * Client AnythingLLM — endpoints Swagger Jarvis uniquement (lots 0/2/4).
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

export type UploadedDocument = {
  location: string;
  name?: string;
  title?: string;
  id?: string;
};

export class AnythingLlmHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "AnythingLlmHttpError";
  }
}

export class AnythingLlmClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: AnythingLlmClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  authorizationHeader(): string {
    return `Bearer ${this.options.apiKey}`;
  }

  authPath(): string {
    return `${this.baseUrl}/api/v1/auth`;
  }

  workspacesPath(): string {
    return `${this.baseUrl}/api/v1/workspaces`;
  }

  async probeConnection(): Promise<AnythingLlmProbeResult> {
    try {
      await this.requestJson("GET", "/api/v1/auth");
      const body = await this.requestJson<{ workspaces?: unknown[] }>("GET", "/api/v1/workspaces");
      const count = Array.isArray(body.workspaces) ? body.workspaces.length : undefined;
      if (count !== undefined) {
        return {
          ok: true,
          status: 200,
          message: `Connexion OK — ${count} workspace(s) visible(s)`,
          workspaceCount: count,
        };
      }
      return { ok: true, status: 200, message: "Connexion OK" };
    } catch (err) {
      if (err instanceof AnythingLlmHttpError) {
        if (err.status === 401 || err.status === 403) {
          return {
            ok: false,
            status: err.status,
            message: "Clé API AnythingLLM invalide ou absente",
          };
        }
        return {
          ok: false,
          status: err.status,
          message: `AnythingLLM a répondu HTTP ${err.status}`,
        };
      }
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Délai dépassé lors de l'appel AnythingLLM"
          : err instanceof Error
            ? `Erreur réseau AnythingLLM: ${err.message}`
            : "Erreur réseau AnythingLLM";
      return { ok: false, message };
    }
  }

  async listWorkspaceSlugs(): Promise<string[]> {
    const body = await this.requestJson<{ workspaces?: Array<{ slug?: string }> }>(
      "GET",
      "/api/v1/workspaces",
    );
    return (body.workspaces ?? [])
      .map((w) => w.slug)
      .filter((s): s is string => typeof s === "string" && s.length > 0);
  }

  async getWorkspace(slug: string): Promise<{
    documents: Array<{ docpath?: string; filename?: string; id?: string | number }>;
  }> {
    const body = await this.requestJson<{
      workspace?: Array<{
        documents?: Array<{ docpath?: string; filename?: string; id?: string | number }>;
      }>;
    }>("GET", `/api/v1/workspace/${encodeURIComponent(slug)}`);
    const ws = Array.isArray(body.workspace) ? body.workspace[0] : undefined;
    return { documents: ws?.documents ?? [] };
  }

  /**
   * POST /v1/document/upload/{folderName}
   * multipart: file + optional metadata fields
   *
   * `chunkSource` au format `link://https://…` rend la citation cliquable
   * dans le chat Jarvis (parseChunkSource côté AnythingLLM).
   */
  async uploadMarkdown(params: {
    folderName: string;
    filename: string;
    content: string;
    title: string;
    docSource?: string;
    chunkSource?: string;
    description?: string;
  }): Promise<UploadedDocument> {
    const form = new FormData();
    const blob = new Blob([params.content], { type: "text/markdown" });
    form.append("file", blob, params.filename);
    const metadata: Record<string, string> = {
      title: params.title,
      docAuthor: "BookStack Sync",
      description: params.description ?? "Synchronisé depuis BookStack",
      docSource: params.docSource ?? "bookstack-sync",
    };
    if (params.chunkSource) {
      metadata.chunkSource = params.chunkSource;
    }
    form.append("metadata", JSON.stringify(metadata));

    const body = await this.requestForm<{
      success?: boolean;
      error?: string | null;
      documents?: UploadedDocument[];
    }>("POST", `/api/v1/document/upload/${encodeURIComponent(params.folderName)}`, form);

    if (body.success === false) {
      throw new AnythingLlmHttpError(body.error ?? "Upload AnythingLLM échoué", 500);
    }
    const doc = body.documents?.[0];
    if (!doc?.location) {
      throw new AnythingLlmHttpError("Réponse upload sans location", 502, JSON.stringify(body));
    }
    return doc;
  }

  /** POST /v1/workspace/{slug}/update-embeddings */
  async updateEmbeddings(params: {
    slug: string;
    adds?: string[];
    deletes?: string[];
  }): Promise<void> {
    await this.requestJson("POST", `/api/v1/workspace/${encodeURIComponent(params.slug)}/update-embeddings`, {
      adds: params.adds ?? [],
      deletes: params.deletes ?? [],
    });
  }

  /** DELETE /v1/system/remove-documents — succès HTTP non fiable (lot 0). */
  async removeDocuments(names: string[]): Promise<void> {
    if (names.length === 0) return;
    await this.requestJson("DELETE", "/api/v1/system/remove-documents", { names });
  }

  private async requestJson<T>(
    method: string,
    path: string,
    jsonBody?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const init: RequestInit = {
        method,
        headers: {
          Authorization: this.authorizationHeader(),
          Accept: "application/json",
          ...(jsonBody !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        redirect: "error",
        signal: controller.signal,
      };
      if (jsonBody !== undefined) {
        init.body = JSON.stringify(jsonBody);
      }
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AnythingLlmHttpError(`HTTP ${res.status} ${path}`, res.status, text.slice(0, 500));
      }
      if (res.status === 204) return {} as T;
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestForm<T>(method: string, path: string, form: FormData): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: this.authorizationHeader(),
          Accept: "application/json",
        },
        body: form,
        redirect: "error",
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AnythingLlmHttpError(`HTTP ${res.status} ${path}`, res.status, text.slice(0, 500));
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
