import { env } from '../../../config/env';
import type { ClassificationInferenceProvider } from '../provider';
import type { ClassifierEmailContext } from '../types';
import { classifyWithOpenAiCompatibleApi } from './openAiCompatibleClient';

export class OpenClawInferenceProvider implements ClassificationInferenceProvider {
  readonly providerName = 'openclaw';

  async classifyEmail(context: ClassifierEmailContext) {
    if (!env.OPENCLAW_INFERENCE_URL) {
      throw new Error('OPENCLAW_INFERENCE_URL is not configured');
    }

    const headers =
      env.OPENCLAW_INFERENCE_AUTH_MODE === 'bearer'
        ? this.buildBearerHeaders()
        : this.buildSharedSecretHeaders();

    return classifyWithOpenAiCompatibleApi({
      endpointUrl: env.OPENCLAW_INFERENCE_URL,
      model: env.CLASSIFICATION_MODEL,
      timeoutMs: env.CLASSIFICATION_TIMEOUT_MS,
      providerName: this.providerName,
      headers,
      context
    });
  }

  private buildBearerHeaders(): Record<string, string> {
    if (!env.OPENCLAW_INFERENCE_BEARER_TOKEN) {
      throw new Error(
        'OPENCLAW_INFERENCE_BEARER_TOKEN is required when OPENCLAW_INFERENCE_AUTH_MODE=bearer'
      );
    }

    return {
      Authorization: `Bearer ${env.OPENCLAW_INFERENCE_BEARER_TOKEN}`
    };
  }

  private buildSharedSecretHeaders(): Record<string, string> {
    if (!env.OPENCLAW_INFERENCE_SHARED_SECRET) {
      throw new Error(
        'OPENCLAW_INFERENCE_SHARED_SECRET is required when OPENCLAW_INFERENCE_AUTH_MODE=shared_secret'
      );
    }

    return {
      'x-openclaw-shared-secret': env.OPENCLAW_INFERENCE_SHARED_SECRET
    };
  }
}
