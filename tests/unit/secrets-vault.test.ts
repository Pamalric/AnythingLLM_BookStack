import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "../../apps/api/src/secrets/vault.js";

describe("secrets vault crypto", () => {
  it("chiffre et déchiffre sans perte", () => {
    const key = "unit-test-master-key-16+";
    const payload = encryptJson(
      {
        bookstackTokenId: "id1",
        bookstackTokenSecret: "sec1",
        anythingllmApiKey: "key1",
      },
      key,
    );
    expect(payload[0]).toBe(1);
    const roundtrip = decryptJson(payload, key);
    expect(roundtrip).toEqual({
      bookstackTokenId: "id1",
      bookstackTokenSecret: "sec1",
      anythingllmApiKey: "key1",
    });
  });

  it("échoue avec une mauvaise clé", () => {
    const payload = encryptJson({ anythingllmApiKey: "x" }, "correct-master-key!!");
    expect(() => decryptJson(payload, "wrong-master-key!!!!")).toThrow();
  });
});
