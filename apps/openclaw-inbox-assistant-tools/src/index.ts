import { InboxAssistantClient } from "./client/inboxAssistantClient.js";
import { pluginConfigSchema, type PluginConfig } from "./schemas/toolSchemas.js";
import { createTools } from "./tools/definitions.js";

interface OpenClawToolRegistration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    toolCallId: string,
    input: unknown,
    signal?: AbortSignal,
    onUpdate?: (partialResult: unknown) => void,
  ): Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: unknown;
  }>;
}

interface OpenClawPluginApi {
  config?: {
    plugins?: {
      entries?: Record<string, { config?: PluginConfig }>;
    };
  };
  registerTool(tool: OpenClawToolRegistration, options?: { optional?: boolean }): void;
}

export const OPENCLAW_PLUGIN_ID = "openclaw-inbox-assistant-tools";

function getPluginConfig(api: OpenClawPluginApi): PluginConfig {
  const rawConfig = api.config?.plugins?.entries?.[OPENCLAW_PLUGIN_ID]?.config;
  return pluginConfigSchema.parse(rawConfig);
}

export default function register(api: OpenClawPluginApi) {
  const client = new InboxAssistantClient(getPluginConfig(api));

  for (const tool of createTools(client)) {
    api.registerTool(
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        execute: async (_toolCallId, input) => {
          const result = await tool.execute(input);
          return {
            content: [{ type: "text", text: result.summary }],
            details: result.details,
          };
        },
      },
      { optional: true },
    );
  }
}

export * from "./client/inboxAssistantClient.js";
export * from "./tools/definitions.js";
