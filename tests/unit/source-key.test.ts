import { describe, expect, it } from "vitest";
import { buildSourceKey, normalizeInstanceId, parseSourceKey } from "@bookstack-sync/shared";

describe("source-key", () => {
  it("construit une clé stable", () => {
    expect(buildSourceKey("documentation.xperteam.net", 42)).toBe(
      "bookstack:documentation.xperteam.net:page:42",
    );
  });

  it("normalise l'instance", () => {
    expect(normalizeInstanceId("https://Documentation.Xperteam.Net/")).toBe(
      "documentation.xperteam.net",
    );
  });

  it("parse une clé valide", () => {
    expect(parseSourceKey("bookstack:documentation.xperteam.net:page:7")).toEqual({
      instanceId: "documentation.xperteam.net",
      pageId: "7",
    });
  });

  it("rejette une clé invalide", () => {
    expect(parseSourceKey("page:7")).toBeNull();
  });
});
