export type UrlValidationResult =
  | { ok: true; url: URL; hostname: string }
  | { ok: false; code: string; message: string };

/**
 * Valide une URL contre une allowlist d'hôtes (anti-SSRF).
 * - https obligatoire, sauf http pour hôtes internes explicitement listés
 * - pas d'identifiants dans l'URL, pas d'IP littérale privée non listée
 */
export function validateAllowedUrl(
  raw: string,
  allowedHosts: string[],
  options?: { allowHttpHosts?: string[] },
): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: "INVALID_URL", message: "URL invalide" };
  }

  if (url.username || url.password) {
    return {
      ok: false,
      code: "URL_CREDENTIALS_FORBIDDEN",
      message: "Les identifiants dans l'URL sont interdits",
    };
  }

  const hostname = url.hostname.toLowerCase();
  const allowHttp = new Set(
    (options?.allowHttpHosts ?? []).map((h) => h.toLowerCase()),
  );
  const allowed = new Set(allowedHosts.map((h) => h.toLowerCase()));

  if (!allowed.has(hostname)) {
    return {
      ok: false,
      code: "HOST_NOT_ALLOWED",
      message: `Hôte non autorisé: ${hostname}`,
    };
  }

  if (url.protocol === "https:") {
    // ok
  } else if (url.protocol === "http:" && allowHttp.has(hostname)) {
    // ok — ex. anythingllm sur réseau Docker
  } else {
    return {
      ok: false,
      code: "PROTOCOL_NOT_ALLOWED",
      message: "Seul HTTPS est autorisé (HTTP réservé aux hôtes internes allowlistés)",
    };
  }

  if (url.port && !["", "80", "443", "3001", "8080"].includes(url.port)) {
    // ports non standards acceptés seulement si hôte allowlisté (déjà vérifié)
  }

  return { ok: true, url, hostname };
}

export function stripUrlToOrigin(url: URL): string {
  return `${url.protocol}//${url.host}`;
}
