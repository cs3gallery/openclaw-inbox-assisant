import { z } from "zod";

export const pluginConfigSchema = z.object({
  baseUrl: z.string().url(),
  bearerToken: z.string().min(1),
  assistantName: z.string().min(1).default("Nova"),
});

export const listEmailsSchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.number().int().positive().max(100).default(10),
  only_unresolved: z.boolean().default(true),
  requested_by: z.string().min(1).default("openclaw"),
});

export const createTodoSchema = z.object({
  email_id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).optional(),
  due_date: z.string().datetime().optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  requested_by: z.string().min(1).default("openclaw"),
  idempotency_key: z.string().min(1).max(200).optional(),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;
export type ListEmailsInput = z.infer<typeof listEmailsSchema>;
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
