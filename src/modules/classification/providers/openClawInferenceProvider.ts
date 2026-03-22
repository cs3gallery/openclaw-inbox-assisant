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

    return classifyWithOpenAiCompatibleApi({
      endpointUrl: env.OPENCLAW_INFERENCE_URL,
      model: env.CLASSIFICATION_MODEL,
      timeoutMs: env.CLASSIFICATION_TIMEOUT_MS,
      providerName: this.providerName,
      headers: {
        ...(env.OPENCLAW_INFERENCE_SHARED_SECRET
          ? { 'x-openclaw-shared-secret': env.OPENCLAW_INFERENCE_SHARED_SECRET }
          : {})
      },
      context
    });
  }
}
