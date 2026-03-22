import { env } from '../../../config/env';
import type { ClassificationInferenceProvider } from '../provider';
import type { ClassifierEmailContext } from '../types';
import { classifyWithOpenAiCompatibleApi } from './openAiCompatibleClient';

export class OpenAiFallbackProvider implements ClassificationInferenceProvider {
  readonly providerName = 'openai';

  async classifyEmail(context: ClassifierEmailContext) {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    return classifyWithOpenAiCompatibleApi({
      endpointUrl: `${env.OPENAI_BASE_URL}/chat/completions`,
      model: env.CLASSIFICATION_MODEL,
      timeoutMs: env.CLASSIFICATION_TIMEOUT_MS,
      providerName: this.providerName,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      context
    });
  }
}
