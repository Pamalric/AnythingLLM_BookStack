import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  ALLOWED_BOOKSTACK_HOSTS: z.string().default("documentation.xperteam.net"),
  ALLOWED_ANYTHINGLLM_HOSTS: z.string().default("jarvis.xperteam.net,anythingllm"),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  isProd: boolean;
  allowedBookstackHosts: string[];
  allowedAnythingllmHosts: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuration invalide: ${msg}`);
  }
  const data = parsed.data;
  if (!data.ADMIN_PASSWORD_HASH && !data.ADMIN_PASSWORD) {
    throw new Error(
      "Configuration invalide: définir ADMIN_PASSWORD (bootstrap) ou ADMIN_PASSWORD_HASH",
    );
  }
  return {
    ...data,
    isProd: data.NODE_ENV === "production",
    allowedBookstackHosts: splitHosts(data.ALLOWED_BOOKSTACK_HOSTS),
    allowedAnythingllmHosts: splitHosts(data.ALLOWED_ANYTHINGLLM_HOSTS),
  };
}

function splitHosts(value: string): string[] {
  return value
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}
