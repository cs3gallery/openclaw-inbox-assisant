import { z } from 'zod';

import {
  EMAIL_CATEGORY_VALUES,
  EMAIL_URGENCY_VALUES,
  FINANCE_DOC_TYPE_VALUES,
  SENTIMENT_VALUES
} from './constants';
import { classificationOutputSchema, type ClassifierEmailContext, type ClassificationOutput } from './types';

const CATEGORY_SET = new Set<string>(EMAIL_CATEGORY_VALUES);
const URGENCY_SET = new Set<string>(EMAIL_URGENCY_VALUES);
const FINANCE_DOC_TYPE_SET = new Set<string>(FINANCE_DOC_TYPE_VALUES);
const SENTIMENT_SET = new Set<string>(SENTIMENT_VALUES);

const MAX_DEBUG_DEPTH = 5;
const MAX_DEBUG_ARRAY_ITEMS = 20;
const MAX_DEBUG_STRING_LENGTH = 2000;

export type ClassificationRepairAction = {
  type: string;
  path: string;
  detail: string;
  from?: unknown;
  to?: unknown;
};

type ValidationIssueSnapshot = {
  path: string;
  code: string;
  message: string;
  received?: unknown;
  expected?: unknown;
};

type ParsedContentResult =
  | {
      ok: true;
      parsedJson: unknown;
      parseActions: ClassificationRepairAction[];
    }
  | {
      ok: false;
      parseError: string;
      parseActions: ClassificationRepairAction[];
    };

type RepairClassificationOutputResult = {
  normalizedJson: unknown;
  repairActions: ClassificationRepairAction[];
};

export type ClassificationDebugSnapshot = {
  provider: string;
  model_name: string;
  raw_content: string;
  raw_response: unknown;
  parsed_json?: unknown;
  normalized_json?: unknown;
  repair_actions: ClassificationRepairAction[];
  validation_errors: ValidationIssueSnapshot[];
};

export class ClassificationOutputValidationError extends Error {
  readonly debugSnapshot: ClassificationDebugSnapshot;

  constructor(message: string, debugSnapshot: ClassificationDebugSnapshot) {
    super(message);
    this.name = 'ClassificationOutputValidationError';
    this.debugSnapshot = debugSnapshot;
  }
}

export function parseAndValidateClassificationOutput(input: {
  rawContent: string;
  rawResponse: Record<string, unknown>;
  providerName: string;
  modelName: string;
  context: ClassifierEmailContext;
}): {
  output: ClassificationOutput;
  repairActions: ClassificationRepairAction[];
  parsedJson: unknown;
  normalizedJson: unknown;
} {
  const parsedContent = parseModelContentAsJson(input.rawContent);

  if (!parsedContent.ok) {
    throw new ClassificationOutputValidationError(
      `${input.providerName} classification response did not contain parseable JSON`,
      {
        provider: input.providerName,
        model_name: input.modelName,
        raw_content: truncateDebugString(input.rawContent),
        raw_response: snapshotDebugValue(input.rawResponse),
        repair_actions: parsedContent.parseActions,
        validation_errors: [
          {
            path: '$',
            code: 'invalid_json',
            message: parsedContent.parseError
          }
        ]
      }
    );
  }

  const repaired = repairClassificationOutput(parsedContent.parsedJson, input.context);
  const validation = classificationOutputSchema.safeParse(repaired.normalizedJson);

  if (!validation.success) {
    throw new ClassificationOutputValidationError(
      `${input.providerName} classification response failed schema validation after normalization`,
      {
        provider: input.providerName,
        model_name: input.modelName,
        raw_content: truncateDebugString(input.rawContent),
        raw_response: snapshotDebugValue(input.rawResponse),
        parsed_json: snapshotDebugValue(parsedContent.parsedJson),
        normalized_json: snapshotDebugValue(repaired.normalizedJson),
        repair_actions: [...parsedContent.parseActions, ...repaired.repairActions],
        validation_errors: validation.error.issues.map(mapValidationIssue)
      }
    );
  }

  return {
    output: validation.data,
    repairActions: [...parsedContent.parseActions, ...repaired.repairActions],
    parsedJson: parsedContent.parsedJson,
    normalizedJson: repaired.normalizedJson
  };
}

export function snapshotDebugValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length <= MAX_DEBUG_STRING_LENGTH
      ? value
      : `${value.slice(0, MAX_DEBUG_STRING_LENGTH)}...[truncated]`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_DEBUG_ARRAY_ITEMS).map((item) => snapshotDebugValue(item, depth + 1));
  }

  if (depth >= MAX_DEBUG_DEPTH) {
    return '[truncated]';
  }

  if (!isRecord(value)) {
    return String(value);
  }

  const snapshot: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    snapshot[key] = snapshotDebugValue(nestedValue, depth + 1);
  }

  return snapshot;
}

function mapValidationIssue(issue: z.ZodIssue): ValidationIssueSnapshot {
  const snapshot: ValidationIssueSnapshot = {
    path: issue.path.length > 0 ? issue.path.join('.') : '$',
    code: issue.code,
    message: issue.message
  };

  if ('received' in issue) {
    snapshot.received = snapshotDebugValue(issue.received);
  }

  if ('expected' in issue) {
    snapshot.expected = snapshotDebugValue(issue.expected);
  }

  return snapshot;
}

function parseModelContentAsJson(rawContent: string): ParsedContentResult {
  const parseActions: ClassificationRepairAction[] = [];
  const trimmed = rawContent.trim();

  const directParse = tryParseJson(trimmed);

  if (directParse.ok) {
    return {
      ok: true,
      parsedJson: directParse.value,
      parseActions
    };
  }

  const withoutCodeFence = stripCodeFence(trimmed);

  if (withoutCodeFence !== trimmed) {
    const strippedParse = tryParseJson(withoutCodeFence);

    if (strippedParse.ok) {
      parseActions.push({
        type: 'strip_code_fence',
        path: '$',
        detail: 'Removed markdown code fences before JSON parsing.'
      });

      return {
        ok: true,
        parsedJson: strippedParse.value,
        parseActions
      };
    }
  }

  const extractedObject = extractJsonObject(trimmed);

  if (extractedObject) {
    const extractedParse = tryParseJson(extractedObject);

    if (extractedParse.ok) {
      parseActions.push({
        type: 'extract_json_object',
        path: '$',
        detail: 'Extracted the first JSON object from mixed model output.'
      });

      return {
        ok: true,
        parsedJson: extractedParse.value,
        parseActions
      };
    }
  }

  return {
    ok: false,
    parseError: directParse.error,
    parseActions
  };
}

function repairClassificationOutput(
  candidate: unknown,
  context: ClassifierEmailContext
): RepairClassificationOutputResult {
  if (!isRecord(candidate)) {
    return {
      normalizedJson: candidate,
      repairActions: []
    };
  }

  const repairActions: ClassificationRepairAction[] = [];
  const normalized: Record<string, unknown> = {
    ...candidate
  };

  const financeDocType = normalizeFinanceDocType(normalized.finance_doc_type, repairActions);
  if (financeDocType !== undefined) {
    normalized.finance_doc_type = financeDocType;
  }

  const category = normalizeCategory(normalized.category, financeDocType, repairActions);
  if (category !== undefined) {
    normalized.category = category;
  }

  const urgency = normalizeUrgency(normalized.urgency, normalized.category, repairActions);
  if (urgency !== undefined) {
    normalized.urgency = urgency;
  }

  const needsReply = normalizeBoolean(normalized.needs_reply, 'needs_reply', repairActions);
  if (needsReply !== undefined) {
    normalized.needs_reply = needsReply;
  }

  const emergencyScore = normalizeNumber(
    normalized.emergency_score,
    'emergency_score',
    repairActions
  );
  if (emergencyScore !== undefined) {
    normalized.emergency_score = emergencyScore;
  } else if (normalized.emergency_score === undefined || normalized.emergency_score === null) {
    const derivedEmergencyScore = deriveEmergencyScore(normalized.category, normalized.urgency);
    normalized.emergency_score = derivedEmergencyScore;
    repairActions.push({
      type: 'fill_default',
      path: 'emergency_score',
      detail: 'Filled missing emergency_score from repaired category/urgency.',
      to: derivedEmergencyScore
    });
  }

  const taskLikelihood = normalizeNumber(
    normalized.task_likelihood,
    'task_likelihood',
    repairActions
  );
  if (taskLikelihood !== undefined) {
    normalized.task_likelihood = taskLikelihood;
  } else if (normalized.task_likelihood === undefined || normalized.task_likelihood === null) {
    const derivedTaskLikelihood = deriveTaskLikelihood(normalized.category, normalized.needs_reply);
    normalized.task_likelihood = derivedTaskLikelihood;
    repairActions.push({
      type: 'fill_default',
      path: 'task_likelihood',
      detail: 'Filled missing task_likelihood from repaired category/reply requirement.',
      to: derivedTaskLikelihood
    });
  }

  if (financeDocType === undefined && normalized.finance_doc_type === undefined) {
    const derivedFinanceDocType = deriveFinanceDocType(normalized.category);
    normalized.finance_doc_type = derivedFinanceDocType;
    repairActions.push({
      type: 'fill_default',
      path: 'finance_doc_type',
      detail: 'Filled missing finance_doc_type from repaired category.',
      to: derivedFinanceDocType
    });
  }

  const confidence = normalizeNumber(normalized.confidence, 'confidence', repairActions);
  if (confidence !== undefined) {
    normalized.confidence = confidence;
  } else if (normalized.confidence === undefined || normalized.confidence === null) {
    normalized.confidence = 0.25;
    repairActions.push({
      type: 'fill_default',
      path: 'confidence',
      detail: 'Filled missing confidence with a conservative low-confidence default.',
      to: 0.25
    });
  }

  const explanation = normalizeExplanation(normalized.explanation_json, normalized, context, repairActions);
  if (explanation !== undefined) {
    normalized.explanation_json = explanation;
  }

  return {
    normalizedJson: normalized,
    repairActions
  };
}

function normalizeCategory(
  value: unknown,
  financeDocType: unknown,
  repairActions: ClassificationRepairAction[]
): unknown {
  if (value === undefined || value === null) {
    const derivedCategory =
      typeof financeDocType === 'string' && financeDocType !== 'unknown' && CATEGORY_SET.has(financeDocType)
        ? financeDocType
        : 'uncategorized';
    repairActions.push({
      type: 'fill_default',
      path: 'category',
      detail: 'Filled missing category conservatively.',
      to: derivedCategory
    });

    return derivedCategory;
  }

  const normalizedValue = normalizeLowercaseString(value);

  if (!normalizedValue) {
    return value;
  }

  if (CATEGORY_SET.has(normalizedValue)) {
    return normalizedValue;
  }

  if (typeof financeDocType === 'string' && financeDocType !== 'unknown' && CATEGORY_SET.has(financeDocType)) {
    repairActions.push({
      type: 'map_category_from_finance_doc_type',
      path: 'category',
      detail: 'Mapped invalid category to the validated finance document type.',
      from: value,
      to: financeDocType
    });

    return financeDocType;
  }

  if (
    normalizedValue.includes('alert') ||
    normalizedValue.includes('moderation') ||
    normalizedValue.includes('security') ||
    normalizedValue.includes('incident') ||
    normalizedValue.includes('outage')
  ) {
    repairActions.push({
      type: 'map_category_alias',
      path: 'category',
      detail: 'Mapped alert-like category label to system_alert.',
      from: value,
      to: 'system_alert'
    });

    return 'system_alert';
  }

  if (normalizedValue === 'update' || normalizedValue === 'status_update') {
    repairActions.push({
      type: 'map_category_alias',
      path: 'category',
      detail: 'Mapped update-like category label to internal_update.',
      from: value,
      to: 'internal_update'
    });

    return 'internal_update';
  }

  if (
    normalizedValue === 'informational' ||
    normalizedValue === 'information' ||
    normalizedValue === 'routine' ||
    normalizedValue === 'general'
  ) {
    repairActions.push({
      type: 'map_category_alias',
      path: 'category',
      detail: 'Mapped ambiguous category label to uncategorized conservatively.',
      from: value,
      to: 'uncategorized'
    });

    return 'uncategorized';
  }

  return value;
}

function normalizeUrgency(
  value: unknown,
  category: unknown,
  repairActions: ClassificationRepairAction[]
): unknown {
  if (value === undefined || value === null) {
    const derivedValue = category === 'emergency' ? 'critical' : category === 'system_alert' ? 'high' : 'medium';
    repairActions.push({
      type: 'fill_default',
      path: 'urgency',
      detail: 'Filled missing urgency from repaired category.',
      to: derivedValue
    });

    return derivedValue;
  }

  const normalizedValue = normalizeLowercaseString(value);

  if (!normalizedValue) {
    return value;
  }

  if (URGENCY_SET.has(normalizedValue)) {
    return normalizedValue;
  }

  const mappedValue =
    normalizedValue === 'urgent' || normalizedValue === 'immediate'
      ? 'high'
      : normalizedValue === 'normal'
        ? 'medium'
        : normalizedValue === 'routine'
          ? 'low'
          : normalizedValue === 'severe'
            ? 'critical'
            : undefined;

  if (mappedValue) {
    repairActions.push({
      type: 'map_enum_alias',
      path: 'urgency',
      detail: 'Mapped urgency alias to an allowed enum value.',
      from: value,
      to: mappedValue
    });

    return mappedValue;
  }

  return value;
}

function normalizeFinanceDocType(
  value: unknown,
  repairActions: ClassificationRepairAction[]
): unknown {
  const normalizedValue = normalizeLowercaseString(value);

  if (!normalizedValue) {
    return value;
  }

  if (FINANCE_DOC_TYPE_SET.has(normalizedValue)) {
    return normalizedValue;
  }

  const mappedValue =
    normalizedValue === 'purchase_order' || normalizedValue === 'purchase-order'
      ? 'purchase_confirmation'
      : normalizedValue === 'bill'
        ? 'invoice'
        : undefined;

  if (mappedValue) {
    repairActions.push({
      type: 'map_enum_alias',
      path: 'finance_doc_type',
      detail: 'Mapped finance document alias to an allowed enum value.',
      from: value,
      to: mappedValue
    });

    return mappedValue;
  }

  return value;
}

function normalizeNumber(
  value: unknown,
  path: string,
  repairActions: ClassificationRepairAction[]
): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());

    if (Number.isFinite(parsed)) {
      repairActions.push({
        type: 'coerce_number_string',
        path,
        detail: 'Coerced numeric string to a JSON number.',
        from: value,
        to: parsed
      });

      return parsed;
    }
  }

  return undefined;
}

function normalizeBoolean(
  value: unknown,
  path: string,
  repairActions: ClassificationRepairAction[]
): boolean | undefined {
  if (value === undefined || value === null) {
    repairActions.push({
      type: 'fill_default',
      path,
      detail: 'Filled missing boolean field with a conservative false default.',
      to: false
    });

    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true' || normalizedValue === 'yes') {
      repairActions.push({
        type: 'coerce_boolean_string',
        path,
        detail: 'Coerced boolean string to a JSON boolean.',
        from: value,
        to: true
      });

      return true;
    }

    if (normalizedValue === 'false' || normalizedValue === 'no') {
      repairActions.push({
        type: 'coerce_boolean_string',
        path,
        detail: 'Coerced boolean string to a JSON boolean.',
        from: value,
        to: false
      });

      return false;
    }
  }

  return undefined;
}

function normalizeExplanation(
  value: unknown,
  normalizedOutput: Record<string, unknown>,
  context: ClassifierEmailContext,
  repairActions: ClassificationRepairAction[]
): unknown {
  if (isRecord(value)) {
    return repairExplanationObject(value, normalizedOutput, context, repairActions);
  }

  const synthesized = buildDefaultExplanation(normalizedOutput, context);
  repairActions.push({
    type: 'synthesize_explanation',
    path: 'explanation_json',
    detail: 'Synthesized a conservative explanation_json because the model omitted it.'
  });

  return synthesized;
}

function repairExplanationObject(
  value: Record<string, unknown>,
  normalizedOutput: Record<string, unknown>,
  context: ClassifierEmailContext,
  repairActions: ClassificationRepairAction[]
): Record<string, unknown> {
  const explanation = {
    ...value
  };
  const defaultExplanation = buildDefaultExplanation(normalizedOutput, context);

  explanation.summary = normalizeString(explanation.summary) ?? defaultExplanation.summary;
  explanation.keywords = normalizeStringArray(explanation.keywords) ?? defaultExplanation.keywords;

  const senderImportance = isRecord(explanation.sender_importance)
    ? { ...explanation.sender_importance }
    : undefined;
  explanation.sender_importance = {
    score:
      normalizeNumber(senderImportance?.score, 'explanation_json.sender_importance.score', repairActions) ??
      defaultExplanation.sender_importance.score,
    reason: normalizeString(senderImportance?.reason) ?? defaultExplanation.sender_importance.reason
  };

  const sentiment = isRecord(explanation.sentiment) ? { ...explanation.sentiment } : undefined;
  const normalizedSentimentLabel = normalizeLowercaseString(sentiment?.label);
  explanation.sentiment = {
    label:
      normalizedSentimentLabel && SENTIMENT_SET.has(normalizedSentimentLabel)
        ? normalizedSentimentLabel
        : defaultExplanation.sentiment.label,
    reason: normalizeString(sentiment?.reason) ?? defaultExplanation.sentiment.reason
  };

  explanation.detected_intent =
    normalizeStringArray(explanation.detected_intent) ?? defaultExplanation.detected_intent;
  explanation.urgency_signals =
    normalizeStringArray(explanation.urgency_signals) ?? defaultExplanation.urgency_signals;
  explanation.reply_signals =
    normalizeStringArray(explanation.reply_signals) ?? defaultExplanation.reply_signals;
  explanation.task_signals =
    normalizeStringArray(explanation.task_signals) ?? defaultExplanation.task_signals;
  explanation.finance_signals =
    normalizeStringArray(explanation.finance_signals) ?? defaultExplanation.finance_signals;

  const defaultKeys = [
    'summary',
    'keywords',
    'sender_importance',
    'sentiment',
    'detected_intent',
    'urgency_signals',
    'reply_signals',
    'task_signals',
    'finance_signals'
  ];

  for (const key of defaultKeys) {
    if (!(key in value)) {
      repairActions.push({
        type: 'fill_explanation_field',
        path: `explanation_json.${key}`,
        detail: 'Filled missing explanation_json field with a conservative default.'
      });
    }
  }

  return explanation;
}

function buildDefaultExplanation(
  normalizedOutput: Record<string, unknown>,
  context: ClassifierEmailContext
): {
  summary: string;
  keywords: string[];
  sender_importance: { score: number; reason: string };
  sentiment: { label: string; reason: string };
  detected_intent: string[];
  urgency_signals: string[];
  reply_signals: string[];
  task_signals: string[];
  finance_signals: string[];
} {
  const subject = normalizeString(context.subject) ?? '(no subject)';
  const category = normalizeString(normalizedOutput.category) ?? 'uncategorized';
  const urgency = normalizeString(normalizedOutput.urgency) ?? 'medium';
  const financeDocType = normalizeString(normalizedOutput.finance_doc_type) ?? 'unknown';
  const taskLikelihood = typeof normalizedOutput.task_likelihood === 'number' ? normalizedOutput.task_likelihood : 0;
  const needsReply = normalizedOutput.needs_reply === true;

  return {
    summary: truncateForSchema(`Classification repaired for "${subject}" as ${category} with ${urgency} urgency.`, 500),
    keywords: [subject, category, urgency, financeDocType]
      .map((entry) => truncateForSchema(entry.trim(), 80))
      .filter((entry, index, entries) => entry.length > 0 && entries.indexOf(entry) === index)
      .slice(0, 10),
    sender_importance: {
      score:
        typeof context.senderImportanceScore === 'number' ? clampScore(context.senderImportanceScore) : 0,
      reason: normalizeString(context.senderRelationshipNotes) ?? 'Derived conservatively from sender metadata.'
    },
    sentiment: {
      label: 'neutral',
      reason: 'Model omitted a valid sentiment explanation, so a neutral default was used.'
    },
    detected_intent: [
      category,
      needsReply ? 'reply_expected' : '',
      taskLikelihood >= 0.75 ? 'task_follow_up' : '',
      financeDocType !== 'unknown' ? financeDocType : ''
    ].filter(Boolean),
    urgency_signals: urgency === 'low' ? [] : [`urgency:${urgency}`],
    reply_signals: needsReply ? ['needs_reply'] : [],
    task_signals: taskLikelihood > 0 ? [`task_likelihood:${taskLikelihood}`] : [],
    finance_signals: financeDocType !== 'unknown' ? [financeDocType] : []
  };
}

function deriveEmergencyScore(category: unknown, urgency: unknown): number {
  if (category === 'emergency') {
    return 0.95;
  }

  if (urgency === 'critical') {
    return 0.85;
  }

  if (urgency === 'high') {
    return 0.45;
  }

  return 0;
}

function deriveTaskLikelihood(category: unknown, needsReply: unknown): number {
  if (category === 'task_request') {
    return 0.95;
  }

  if (needsReply === true || category === 'needs_reply') {
    return 0.4;
  }

  return 0;
}

function deriveFinanceDocType(category: unknown): string {
  if (
    category === 'receipt' ||
    category === 'invoice' ||
    category === 'quote' ||
    category === 'purchase_confirmation'
  ) {
    return category;
  }

  return 'unknown';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function truncateDebugString(value: string): string {
  return value.length <= MAX_DEBUG_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_DEBUG_STRING_LENGTH)}...[truncated]`;
}

function truncateForSchema(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalizedItems = value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20);

  return normalizedItems;
}

function normalizeLowercaseString(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

function stripCodeFence(value: string): string {
  const markdownFenceMatch = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return markdownFenceMatch ? markdownFenceMatch[1].trim() : value;
}

function extractJsonObject(value: string): string | null {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return value.slice(start, end + 1);
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return {
      ok: true,
      value: JSON.parse(value)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
    return {
      ok: false,
      error: message
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
