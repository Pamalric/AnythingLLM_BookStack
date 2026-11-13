import { AnythingLlmClient } from "@bookstack-sync/anythingllm-adapter";
import { BookStackClient } from "@bookstack-sync/bookstack-adapter";
import {
  AppError,
  SettingsPatchSchema,
  SecretsUpdateSchema,
  ConnectionTestBodySchema,
  stripUrlToOrigin,
  validateAllowedUrl,
  type SettingsPatch,
} from "@bookstack-sync/shared";
import type { AppConfig } from "../config.js";
import { prisma } from "../db.js";
import { SecretsVault } from "../secrets/vault.js";

export function createSettingsService(config: AppConfig) {
  const vault = new SecretsVault({
    masterKey: config.SECRETS_MASTER_KEY,
    secretsFilePath: config.secretsFilePath,
    env: process.env,
  });

  return {
    async getPublicSettings() {
      const settings = await ensureSettings();
      const { sources } = await vault.resolve();
      const syncAlreadyStarted = (await prisma.targetDocument.count()) > 0;

      return {
        bookstackBaseUrl: settings.bookstackBaseUrl,
        anythingllmBaseUrl: settings.anythingllmBaseUrl,
        workspaceSlug: settings.workspaceSlug,
        bookstackInstanceId: settings.bookstackInstanceId,
        scheduleEnabled: settings.scheduleEnabled,
        scheduleIntervalMin: settings.scheduleIntervalMin,
        removalPolicy: settings.removalPolicy,
        timezone: settings.timezone,
        credentials: {
          bookstackToken: {
            configured: sources.bookstackToken !== "none",
            source: sources.bookstackToken,
          },
          anythingllmApiKey: {
            configured: sources.anythingllmApiKey !== "none",
            source: sources.anythingllmApiKey,
          },
        },
        lastTests: {
          bookstack: {
            at: settings.lastBookstackTestAt?.toISOString() ?? null,
            ok: settings.lastBookstackTestOk,
            message: settings.lastBookstackTestMessage,
          },
          anythingllm: {
            at: settings.lastAnythingllmTestAt?.toISOString() ?? null,
            ok: settings.lastAnythingllmTestOk,
            message: settings.lastAnythingllmTestMessage,
          },
        },
        syncAlreadyStarted,
      };
    },

    async patchSettings(raw: unknown, actor: string) {
      const parsed = SettingsPatchSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError("VALIDATION_ERROR", "Paramètres invalides", 400, parsed.error.flatten());
      }
      const patch = parsed.data;
      const current = await ensureSettings();

      validateUrlFields(patch, config);

      if (
        patch.workspaceSlug !== undefined &&
        patch.workspaceSlug !== current.workspaceSlug &&
        (await prisma.targetDocument.count()) > 0 &&
        patch.confirmWorkspaceChange !== true
      ) {
        throw new AppError(
          "WORKSPACE_CHANGE_CONFIRMATION_REQUIRED",
          "Le workspace a déjà reçu des documents synchronisés. Confirmez le changement explicitement.",
          409,
        );
      }

      const updated = await prisma.settings.update({
        where: { id: 1 },
        data: {
          ...(patch.bookstackBaseUrl !== undefined
            ? {
                bookstackBaseUrl: stripUrlToOrigin(
                  new URL(patch.bookstackBaseUrl),
                ),
                bookstackInstanceId:
                  patch.bookstackInstanceId ??
                  new URL(patch.bookstackBaseUrl).hostname,
              }
            : {}),
          ...(patch.anythingllmBaseUrl !== undefined
            ? {
                anythingllmBaseUrl: stripUrlToOrigin(
                  new URL(patch.anythingllmBaseUrl),
                ),
              }
            : {}),
          ...(patch.workspaceSlug !== undefined ? { workspaceSlug: patch.workspaceSlug } : {}),
          ...(patch.bookstackInstanceId !== undefined && patch.bookstackBaseUrl === undefined
            ? { bookstackInstanceId: patch.bookstackInstanceId }
            : {}),
          ...(patch.scheduleEnabled !== undefined
            ? { scheduleEnabled: patch.scheduleEnabled }
            : {}),
          ...(patch.scheduleIntervalMin !== undefined
            ? { scheduleIntervalMin: patch.scheduleIntervalMin }
            : {}),
          ...(patch.removalPolicy !== undefined ? { removalPolicy: patch.removalPolicy } : {}),
          ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        },
      });

      await prisma.auditEvent.create({
        data: {
          actor,
          action: "settings.patch",
          entity: "Settings",
          details: JSON.stringify({
            fields: Object.keys(patch).filter((k) => k !== "confirmWorkspaceChange"),
            workspaceChanged:
              patch.workspaceSlug !== undefined && patch.workspaceSlug !== current.workspaceSlug,
          }),
        },
      });

      return updated;
    },

    async updateSecrets(raw: unknown, actor: string) {
      const parsed = SecretsUpdateSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError("VALIDATION_ERROR", "Secrets invalides", 400, parsed.error.flatten());
      }
      const body = parsed.data;

      if (body.clearBookstackToken || body.clearAnythingllmApiKey || body.bookstackTokenId || body.anythingllmApiKey) {
        if (!config.SECRETS_MASTER_KEY) {
          throw new AppError(
            "SECRETS_MASTER_KEY_REQUIRED",
            "Définissez SECRETS_MASTER_KEY pour enregistrer ou effacer des secrets via l'UI (sinon utilisez les variables d'environnement).",
            400,
          );
        }
      }

      const current = await vault.readEncrypted();
      const next = { ...current };

      if (body.clearBookstackToken) {
        delete next.bookstackTokenId;
        delete next.bookstackTokenSecret;
      }
      if (body.bookstackTokenId && body.bookstackTokenSecret) {
        next.bookstackTokenId = body.bookstackTokenId;
        next.bookstackTokenSecret = body.bookstackTokenSecret;
      }
      if (body.clearAnythingllmApiKey) {
        delete next.anythingllmApiKey;
      }
      if (body.anythingllmApiKey) {
        next.anythingllmApiKey = body.anythingllmApiKey;
      }

      await vault.writeEncrypted(next);

      await prisma.credentialRef.upsert({
        where: { kind: "bookstack_token" },
        create: {
          kind: "bookstack_token",
          source: next.bookstackTokenId ? "encrypted" : "none",
          label: "BookStack API Token",
        },
        update: {
          source: next.bookstackTokenId ? "encrypted" : "none",
        },
      });
      await prisma.credentialRef.upsert({
        where: { kind: "anythingllm_api_key" },
        create: {
          kind: "anythingllm_api_key",
          source: next.anythingllmApiKey ? "encrypted" : "none",
          label: "AnythingLLM API Key",
        },
        update: {
          source: next.anythingllmApiKey ? "encrypted" : "none",
        },
      });

      await prisma.auditEvent.create({
        data: {
          actor,
          action: "settings.secrets.update",
          entity: "CredentialRef",
          details: JSON.stringify({
            bookstackTokenUpdated: Boolean(body.bookstackTokenId) || Boolean(body.clearBookstackToken),
            anythingllmKeyUpdated:
              Boolean(body.anythingllmApiKey) || Boolean(body.clearAnythingllmApiKey),
            clearedBookstack: Boolean(body.clearBookstackToken),
            clearedAnythingllm: Boolean(body.clearAnythingllmApiKey),
          }),
        },
      });

      // Ne jamais renvoyer les secrets
      return { updated: true as const };
    },

    async testConnections(raw: unknown, actor: string) {
      const parsed = ConnectionTestBodySchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError("VALIDATION_ERROR", "Cible de test invalide", 400);
      }
      const settings = await ensureSettings();
      const { secrets, sources } = await vault.resolve();
      const target = parsed.data.target;
      const results: Record<string, { ok: boolean; message: string }> = {};

      if (target === "bookstack" || target === "both") {
        const urlCheck = validateAllowedUrl(
          settings.bookstackBaseUrl,
          config.allowedBookstackHosts,
        );
        if (!urlCheck.ok) {
          results.bookstack = { ok: false, message: urlCheck.message };
        } else if (sources.bookstackToken === "none" || !secrets.bookstackTokenId || !secrets.bookstackTokenSecret) {
          results.bookstack = {
            ok: false,
            message: "Token BookStack non configuré",
          };
        } else {
          const client = new BookStackClient({
            baseUrl: settings.bookstackBaseUrl,
            auth: {
              tokenId: secrets.bookstackTokenId,
              tokenSecret: secrets.bookstackTokenSecret,
            },
          });
          const probe = await client.probeConnection();
          results.bookstack = { ok: probe.ok, message: probe.message };
          await prisma.settings.update({
            where: { id: 1 },
            data: {
              lastBookstackTestAt: new Date(),
              lastBookstackTestOk: probe.ok,
              lastBookstackTestMessage: probe.message.slice(0, 500),
            },
          });
        }
      }

      if (target === "anythingllm" || target === "both") {
        const urlCheck = validateAllowedUrl(settings.anythingllmBaseUrl, config.allowedAnythingllmHosts, {
          allowHttpHosts: config.allowedAnythingllmHosts.filter((h) => h === "anythingllm"),
        });
        if (!urlCheck.ok) {
          results.anythingllm = { ok: false, message: urlCheck.message };
        } else if (sources.anythingllmApiKey === "none" || !secrets.anythingllmApiKey) {
          results.anythingllm = {
            ok: false,
            message: "Clé API AnythingLLM non configurée",
          };
        } else {
          const client = new AnythingLlmClient({
            baseUrl: settings.anythingllmBaseUrl,
            apiKey: secrets.anythingllmApiKey,
          });
          const probe = await client.probeConnection();
          results.anythingllm = { ok: probe.ok, message: probe.message };
          await prisma.settings.update({
            where: { id: 1 },
            data: {
              lastAnythingllmTestAt: new Date(),
              lastAnythingllmTestOk: probe.ok,
              lastAnythingllmTestMessage: probe.message.slice(0, 500),
            },
          });
        }
      }

      await prisma.auditEvent.create({
        data: {
          actor,
          action: "settings.connections.test",
          entity: "Settings",
          details: JSON.stringify({
            target,
            bookstackOk: results.bookstack?.ok ?? null,
            anythingllmOk: results.anythingllm?.ok ?? null,
          }),
        },
      });

      return results;
    },

    async listWorkspaces() {
      const settings = await ensureSettings();
      const { secrets, sources } = await vault.resolve();
      if (sources.anythingllmApiKey === "none" || !secrets.anythingllmApiKey) {
        throw new AppError(
          "CREDENTIALS_MISSING",
          "Clé API AnythingLLM non configurée. Enregistrez-la dans Configuration (champ Clé API), pas dans le slug workspace.",
          400,
        );
      }
      const urlCheck = validateAllowedUrl(settings.anythingllmBaseUrl, config.allowedAnythingllmHosts, {
        allowHttpHosts: config.allowedAnythingllmHosts.filter((h) => h === "anythingllm"),
      });
      if (!urlCheck.ok) {
        throw new AppError(urlCheck.code, urlCheck.message, 400);
      }
      const client = new AnythingLlmClient({
        baseUrl: settings.anythingllmBaseUrl,
        apiKey: secrets.anythingllmApiKey,
      });
      const slugs = await client.listWorkspaceSlugs();
      return { workspaces: slugs.map((slug) => ({ slug })) };
    },
  };
}

async function ensureSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: 1 } });
}

function validateUrlFields(patch: SettingsPatch, config: AppConfig): void {
  if (patch.bookstackBaseUrl) {
    const r = validateAllowedUrl(patch.bookstackBaseUrl, config.allowedBookstackHosts);
    if (!r.ok) {
      throw new AppError(r.code, r.message, 400);
    }
  }
  if (patch.anythingllmBaseUrl) {
    const r = validateAllowedUrl(patch.anythingllmBaseUrl, config.allowedAnythingllmHosts, {
      allowHttpHosts: config.allowedAnythingllmHosts.filter((h) => h === "anythingllm"),
    });
    if (!r.ok) {
      throw new AppError(r.code, r.message, 400);
    }
  }
}

export type SettingsService = ReturnType<typeof createSettingsService>;
