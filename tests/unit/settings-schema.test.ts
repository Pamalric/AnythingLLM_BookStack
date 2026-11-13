import { describe, expect, it } from "vitest";
import { SecretsUpdateSchema, SettingsPatchSchema } from "@bookstack-sync/shared";

describe("settings schemas", () => {
  it("accepte un patch valide", () => {
    const r = SettingsPatchSchema.safeParse({
      scheduleIntervalMin: 60,
      scheduleEnabled: true,
      workspaceSlug: "bookstack-sync-recette",
    });
    expect(r.success).toBe(true);
  });

  it("rejette une fréquence invalide", () => {
    const r = SettingsPatchSchema.safeParse({ scheduleIntervalMin: 10 });
    expect(r.success).toBe(false);
  });

  it("exige ID+secret BookStack ensemble", () => {
    const r = SecretsUpdateSchema.safeParse({ bookstackTokenId: "only-id" });
    expect(r.success).toBe(false);
  });

  it("accepte une clé AnythingLLM seule", () => {
    const r = SecretsUpdateSchema.safeParse({ anythingllmApiKey: "sk-test" });
    expect(r.success).toBe(true);
  });
});
