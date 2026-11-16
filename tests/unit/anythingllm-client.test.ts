import { describe, expect, it, vi } from "vitest";
import { AnythingLlmClient } from "@bookstack-sync/anythingllm-adapter";

describe("AnythingLlmClient", () => {
  it("probeConnection mappe 401", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 }));
    const client = new AnythingLlmClient({
      baseUrl: "https://jarvis.xperteam.net",
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const probe = await client.probeConnection();
    expect(probe.ok).toBe(false);
    expect(probe.status).toBe(401);
  });

  it("Authorization Bearer", () => {
    const client = new AnythingLlmClient({
      baseUrl: "https://jarvis.xperteam.net/",
      apiKey: "abc",
    });
    expect(client.authorizationHeader()).toBe("Bearer abc");
    expect(client.workspacesPath()).toBe("https://jarvis.xperteam.net/api/v1/workspaces");
  });

  it("uploadMarkdown envoie chunkSource link:// pour citations", async () => {
    let capturedMetadata: string | null = null;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const form = init?.body as FormData;
      capturedMetadata = String(form.get("metadata"));
      return new Response(
        JSON.stringify({
          success: true,
          documents: [{ location: "bookstack-sync/bs-1-intro.md-abc.json" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new AnythingLlmClient({
      baseUrl: "https://jarvis.xperteam.net",
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const url = "https://documentation.xperteam.net/books/guide/page/intro";
    await client.uploadMarkdown({
      folderName: "bookstack-sync",
      filename: "bs-1-intro.md",
      content: "Source BookStack: " + url + "\n\n# Intro",
      title: "Intro",
      docSource: url,
      chunkSource: `link://${url}`,
    });

    expect(capturedMetadata).toBeTruthy();
    const meta = JSON.parse(capturedMetadata!) as Record<string, string>;
    expect(meta.docSource).toBe(url);
    expect(meta.chunkSource).toBe(`link://${url}`);
    expect(meta.title).toBe("Intro");
  });
});
