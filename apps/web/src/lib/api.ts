export function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|; )bss_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string; code?: string }> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const method = (init.method ?? "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = readCsrfCookie();
    if (csrf) {
      headers.set("x-csrf-token", csrf);
    }
  }

  try {
    const res = await fetch(path, {
      ...init,
      headers,
      credentials: "include",
    });
    const body = (await res.json().catch(() => null)) as
      | { message?: string; code?: string }
      | T
      | null;

    if (!res.ok) {
      const err = body as { message?: string; code?: string } | null;
      return {
        ok: false,
        status: res.status,
        message: err?.message ?? `Erreur HTTP ${res.status}`,
        code: err?.code,
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, message: "Réseau indisponible" };
  }
}
