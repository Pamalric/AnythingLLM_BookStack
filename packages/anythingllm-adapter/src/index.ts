/**
 * Client AnythingLLM — endpoints issus exclusivement du Swagger Jarvis (lot 0).
 * Mutations / upload / embeddings : lot 4.
 */
export type AnythingLlmClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class AnythingLlmClient {
  readonly baseUrl: string;

  constructor(private readonly options: AnythingLlmClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
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
}
