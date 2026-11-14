import { describe, expect, it } from "vitest";
import { HISTORY_RETENTION_DAYS } from "../../apps/api/src/services/maintenance.js";

describe("maintenance", () => {
  it("rétention historique = 90 jours (CDC)", () => {
    expect(HISTORY_RETENTION_DAYS).toBe(90);
  });
});
