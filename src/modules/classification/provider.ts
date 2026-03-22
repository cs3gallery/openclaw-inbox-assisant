import type { ClassifierEmailContext, ClassificationOutput } from './types';
import type { ClassificationRepairAction } from './outputHandling';

export type ClassificationInferenceResult = {
  output: ClassificationOutput;
  rawResponse: Record<string, unknown>;
  modelName: string;
  providerName: string;
  repairActions: ClassificationRepairAction[];
};

export interface ClassificationInferenceProvider {
  readonly providerName: string;
  classifyEmail(context: ClassifierEmailContext): Promise<ClassificationInferenceResult>;
}
