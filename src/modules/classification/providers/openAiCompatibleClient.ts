import { classificationSystemPrompt, buildClassificationPrompt } from '../prompt';
import {
  classificationOutputSchema,
  classificationResponseJsonSchema,
  type ClassifierEmailContext
} from '../types';

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export type OpenAiCompatibleRequest = {
  endpointUrl: string;
  model: string;
  timeoutMs: number;
  headers: Record<string, string>;
  providerName: string;
  context: ClassifierEmailContext;
};

export async function classifyWithOpenAiCompatibleApi(
  input: OpenAiCompatibleRequest
): Promise<{
  output: ReturnType<typeof classificationOutputSchema.parse>;
  rawResponse: Record<string, unknown>;
  modelName: string;
  providerName: string;
}> {
  const response = await fetch(input.endpointUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...input.headers
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'email_classification',
          strict: true,
          schema: classificationResponseJsonSchema
        }
      },
      messages: [
        {
          role: 'system',
          content: classificationSystemPrompt
        },
        {
          role: 'user',
          content: buildClassificationPrompt(input.context)
        }
      ]
    }),
    signal: AbortSignal.timeout(input.timeoutMs)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${input.providerName} classification request failed with status ${response.status}: ${body}`
    );
  }

  const rawResponse = (await response.json()) as ChatCompletionResponse & Record<string, unknown>;
  const content = rawResponse.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`${input.providerName} classification response did not include message content`);
  }

  return {
    output: classificationOutputSchema.parse(JSON.parse(content)),
    rawResponse,
    modelName: rawResponse.model ?? input.model,
    providerName: input.providerName
  };
}
