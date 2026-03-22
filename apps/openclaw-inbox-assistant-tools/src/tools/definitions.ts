import { z } from "zod";

import type { InboxAssistantClient } from "../client/inboxAssistantClient.js";
import {
  formatCreateTodoResponse,
  formatPendingEmailsResponse,
  formatUrgentEmailsResponse,
} from "../formatters/responses.js";
import {
  createTodoSchema,
  listEmailsSchema,
  type CreateTodoInput,
  type ListEmailsInput,
} from "../schemas/toolSchemas.js";

export interface PluginTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: unknown): Promise<{ summary: string; details: unknown }>;
}

function unwrapToolPayload(payload: unknown): unknown {
  if (
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    (payload as { ok?: unknown }).ok === true &&
    "data" in payload
  ) {
    return (payload as { data: unknown }).data;
  }

  return payload;
}

export function createTools(client: InboxAssistantClient): PluginTool[] {
  return [
    {
      name: "get_urgent_emails",
      description: "Fetch recent urgent or high-priority emails from the inbox assistant.",
      inputSchema: {
        type: "object",
        properties: {
          since: { type: "string", format: "date-time" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          only_unresolved: { type: "boolean" },
          requested_by: { type: "string" },
        },
      },
      execute: async (input) => {
        const parsed: ListEmailsInput = listEmailsSchema.parse(input ?? {});
        const result = unwrapToolPayload(await client.getUrgentEmails(parsed));
        return {
          summary: formatUrgentEmailsResponse(result as Parameters<typeof formatUrgentEmailsResponse>[0]),
          details: result,
        };
      },
    },
    {
      name: "get_pending_emails",
      description: "Fetch emails that likely need reply or action from the inbox assistant.",
      inputSchema: {
        type: "object",
        properties: {
          since: { type: "string", format: "date-time" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          only_unresolved: { type: "boolean" },
          requested_by: { type: "string" },
        },
      },
      execute: async (input) => {
        const parsed: ListEmailsInput = listEmailsSchema.parse(input ?? {});
        const result = unwrapToolPayload(await client.getPendingEmails(parsed));
        return {
          summary: formatPendingEmailsResponse(result as Parameters<typeof formatPendingEmailsResponse>[0]),
          details: result,
        };
      },
    },
    {
      name: "create_todo",
      description: "Queue a todo for a specific email or explicit task request in the inbox assistant.",
      inputSchema: {
        type: "object",
        properties: {
          email_id: { type: "string", format: "uuid" },
          title: { type: "string" },
          notes: { type: "string" },
          due_date: { type: "string", format: "date-time" },
          priority: { type: "string", enum: ["low", "normal", "high"] },
          requested_by: { type: "string" },
          idempotency_key: { type: "string" },
        },
        required: ["title"],
      },
      execute: async (input) => {
        const parsed: CreateTodoInput = createTodoSchema.parse(input ?? {});
        const result = unwrapToolPayload(await client.createTodo(parsed));
        return {
          summary: formatCreateTodoResponse(result as Parameters<typeof formatCreateTodoResponse>[0]),
          details: result,
        };
      },
    },
  ];
}

export function formatToolValidationError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`).join("; ");
}
