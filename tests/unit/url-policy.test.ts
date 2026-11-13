import { describe, expect, it } from "vitest";
import { validateAllowedUrl } from "@bookstack-sync/shared";

describe("validateAllowedUrl", () => {
  const allowed = ["documentation.xperteam.net", "jarvis.xperteam.net", "anythingllm"];

  it("accepte une URL https allowlistée", () => {
    const r = validateAllowedUrl("https://documentation.xperteam.net", allowed);
    expect(r.ok).toBe(true);
  });

  it("rejette un hôte hors allowlist", () => {
    const r = validateAllowedUrl("https://evil.example", allowed);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("HOST_NOT_ALLOWED");
  });

  it("rejette les credentials dans l'URL", () => {
    const r = validateAllowedUrl("https://user:pass@documentation.xperteam.net", allowed);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("URL_CREDENTIALS_FORBIDDEN");
  });

  it("autorise http pour hôte interne listé", () => {
    const r = validateAllowedUrl("http://anythingllm:3001", allowed, {
      allowHttpHosts: ["anythingllm"],
    });
    expect(r.ok).toBe(true);
  });

  it("rejette http pour hôte public", () => {
    const r = validateAllowedUrl("http://jarvis.xperteam.net", allowed, {
      allowHttpHosts: ["anythingllm"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PROTOCOL_NOT_ALLOWED");
  });
});
