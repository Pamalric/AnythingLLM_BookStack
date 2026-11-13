import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../apps/api/src/auth/password.js";

describe("argon2 password", () => {
  it("hash et vérifie", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash.startsWith("$argon2")).toBe(true);
    expect(await verifyPassword(hash, "correct-horse-battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
});
