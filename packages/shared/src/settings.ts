import { z } from "zod";

export const SCHEDULE_INTERVALS_MIN = [15, 30, 60, 360, 1440] as const;

export const RemovalPolicySchema = z.enum(["manual_approval"]);

export const ScheduleIntervalSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.literal(360),
  z.literal(1440),
]);

export const SettingsPatchSchema = z
  .object({
    bookstackBaseUrl: z.string().url().max(512).optional(),
    anythingllmBaseUrl: z.string().url().max(512).optional(),
    workspaceSlug: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug workspace invalide")
      .nullable()
      .optional(),
    bookstackInstanceId: z.string().trim().min(1).max(256).optional(),
    scheduleEnabled: z.boolean().optional(),
    scheduleIntervalMin: ScheduleIntervalSchema.optional(),
    removalPolicy: RemovalPolicySchema.optional(),
    timezone: z.literal("Europe/Paris").optional(),
    /** Requis si le workspace change alors qu'une sync a déjà eu lieu. */
    confirmWorkspaceChange: z.boolean().optional(),
  })
  .strict();

export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const SecretsUpdateSchema = z
  .object({
    bookstackTokenId: z.string().min(1).max(256).optional(),
    bookstackTokenSecret: z.string().min(1).max(512).optional(),
    anythingllmApiKey: z.string().min(1).max(512).optional(),
    clearBookstackToken: z.boolean().optional(),
    clearAnythingllmApiKey: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) =>
      Boolean(v.bookstackTokenId) ||
      Boolean(v.bookstackTokenSecret) ||
      Boolean(v.anythingllmApiKey) ||
      Boolean(v.clearBookstackToken) ||
      Boolean(v.clearAnythingllmApiKey),
    { message: "Aucun secret à mettre à jour" },
  )
  .refine(
    (v) =>
      (!v.bookstackTokenId && !v.bookstackTokenSecret) ||
      (Boolean(v.bookstackTokenId) && Boolean(v.bookstackTokenSecret)),
    { message: "Token BookStack: ID et secret doivent être fournis ensemble" },
  );

export type SecretsUpdate = z.infer<typeof SecretsUpdateSchema>;

export const ConnectionTestBodySchema = z
  .object({
    target: z.enum(["bookstack", "anythingllm", "both"]),
  })
  .strict();

export type ConnectionTestBody = z.infer<typeof ConnectionTestBodySchema>;

export const CredentialStatusSchema = z.object({
  configured: z.boolean(),
  source: z.enum(["env", "encrypted", "none"]),
});

export const SettingsResponseSchema = z.object({
  bookstackBaseUrl: z.string(),
  anythingllmBaseUrl: z.string(),
  workspaceSlug: z.string().nullable(),
  bookstackInstanceId: z.string(),
  scheduleEnabled: z.boolean(),
  scheduleIntervalMin: z.number(),
  removalPolicy: z.string(),
  timezone: z.string(),
  credentials: z.object({
    bookstackToken: CredentialStatusSchema,
    anythingllmApiKey: CredentialStatusSchema,
  }),
  lastTests: z.object({
    bookstack: z
      .object({
        at: z.string().nullable(),
        ok: z.boolean().nullable(),
        message: z.string().nullable(),
      })
      .nullable(),
    anythingllm: z
      .object({
        at: z.string().nullable(),
        ok: z.boolean().nullable(),
        message: z.string().nullable(),
      })
      .nullable(),
  }),
  syncAlreadyStarted: z.boolean(),
});
