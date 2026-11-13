import { z } from "zod";

export const LoginBodySchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
});

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
});
