import type { CreateTodoInput, ListEmailsInput, PluginConfig } from "../schemas/toolSchemas.js";

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export class InboxAssistantClient {
  private readonly baseUrl: string;
  private readonly bearerToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PluginConfig, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.bearerToken = config.bearerToken;
    this.fetchImpl = fetchImpl;
  }

  getUrgentEmails(input: ListEmailsInput): Promise<unknown> {
    return this.request("/tools/get_urgent_emails", {
      method: "POST",
      body: input,
    });
  }

  getPendingEmails(input: ListEmailsInput): Promise<unknown> {
    return this.request("/tools/get_pending_emails", {
      method: "POST",
      body: input,
    });
  }

  createTodo(input: CreateTodoInput): Promise<unknown> {
    return this.request("/tools/create_todo", {
      method: "POST",
      body: input,
    });
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.bearerToken}`,
      },
      body: options.body ? JSON.stringify(options.body) : null,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Inbox assistant request failed with status ${response.status}: ${body}`);
    }

    return (await response.json()) as T;
  }
}
