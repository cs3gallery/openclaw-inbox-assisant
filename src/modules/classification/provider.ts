import type { ClassifierEmailContext, ClassificationOutput } from './types';

export type ClassificationInferenceResult = {
  output: ClassificationOutput;
  rawResponse: Record<string, unknown>;
  modelName: string;
  providerName: string;
};

export interface ClassificationInferenceProvider {
  readonly providerName: string;
  classifyEmail(context: ClassifierEmailContext): Promise<ClassificationInferenceResult>;
}
