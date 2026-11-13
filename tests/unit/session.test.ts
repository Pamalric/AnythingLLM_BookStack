import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
} from "../../apps/api/src/auth/session.js";

describe("session tokens", () => {
  const secret = "unit-test-session-secret-32chars!!";

  it("crée et vérifie un jeton", () => {
    const { token, csrf } = createSessionToken("admin", secret, 60);
    const payload = verifySessionToken(token, secret);
    expect(payload?.sub).toBe("admin");
    expect(payload?.csrf).toBe(csrf);
  });

  it("rejette une signature altérée", () => {
    const { token } = createSessionToken("admin", secret, 60);
    const [body] = token.split(".");
    expect(verifySessionToken(`${body}.deadbeef`, secret)).toBeNull();
  });
});
