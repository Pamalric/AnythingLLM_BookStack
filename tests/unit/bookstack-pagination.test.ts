import { describe, expect, it, vi } from "vitest";
import { BookStackClient, BookStackHttpError } from "@bookstack-sync/bookstack-adapter";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("BookStackClient pagination", () => {
  it("agrège toutes les pages jusqu'au total", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("offset=0")) {
        return jsonResponse({
          data: [
            { id: 1, name: "A" },
            { id: 2, name: "B" },
          ],
          total: 3,
        });
      }
      if (u.includes("offset=2")) {
        return jsonResponse({
          data: [{ id: 3, name: "C" }],
          total: 3,
        });
      }
      throw new Error(`URL inattendue: ${u}`);
    });

    const client = new BookStackClient({
      baseUrl: "https://documentation.xperteam.net",
      auth: { tokenId: "id", tokenSecret: "secret" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pageSize: 2,
    });

    const result = await client.listAllPages();
    expect(result.total).toBe(3);
    expect(result.data.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("échoue si inventaire incohérent", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [{ id: 1, name: "A" }],
        total: 5,
      }),
    );

    const client = new BookStackClient({
      baseUrl: "https://documentation.xperteam.net",
      auth: { tokenId: "id", tokenSecret: "secret" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pageSize: 100,
    });

    await expect(client.listAllPages()).rejects.toBeInstanceOf(BookStackHttpError);
  });

  it("probeConnection mappe 401", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("unauthorized", { status: 401 }),
    );
    const client = new BookStackClient({
      baseUrl: "https://documentation.xperteam.net",
      auth: { tokenId: "id", tokenSecret: "secret" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const probe = await client.probeConnection();
    expect(probe.ok).toBe(false);
    expect(probe.status).toBe(401);
  });
});
