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
});
