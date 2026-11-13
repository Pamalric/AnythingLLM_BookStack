/**
 * Client BookStack — contrat confirmé lot 0 (docs instance v23.10.2).
 * Implémentation HTTP complète : lot 3.
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

export class BookStackClient {
  readonly baseUrl: string;

  constructor(private readonly options: BookStackClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  /** En-tête Token attendu par BookStack. */
  authorizationHeader(): string {
    return `Token ${this.options.auth.tokenId}:${this.options.auth.tokenSecret}`;
  }

  healthPath(): string {
    return `${this.baseUrl}/api/pages?count=1`;
  }
}
