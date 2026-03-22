import { env } from '../../config/env';
import type { ClassificationInferenceProvider } from './provider';
import { OpenClawInferenceProvider } from './providers/openClawInferenceProvider';
import { OpenAiFallbackProvider } from './providers/openAiFallbackProvider';

export function createClassificationInferenceProvider(): ClassificationInferenceProvider {
  switch (env.CLASSIFICATION_PROVIDER) {
    case 'openclaw':
      return new OpenClawInferenceProvider();
    case 'openai':
      return new OpenAiFallbackProvider();
    default:
      throw new Error(`Unsupported classification provider: ${env.CLASSIFICATION_PROVIDER}`);
  }
}
