import { env } from '../../config/env';
import {
  EMAIL_CATEGORY_VALUES,
  EMAIL_URGENCY_VALUES,
  FINANCE_DOC_TYPE_VALUES,
  SENTIMENT_VALUES
} from './constants';
import type { ClassifierEmailContext } from './types';

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n[truncated]`;
}

function formatRecipients(context: ClassifierEmailContext): string {
  if (context.recipients.length === 0) {
    return 'none';
  }

  return context.recipients
    .map((recipient) => {
      const display = recipient.displayName
        ? `${recipient.displayName} <${recipient.emailAddress}>`
        : recipient.emailAddress;
      return `${recipient.recipientType}: ${display}`;
    })
    .join('\n');
}

export function buildClassificationPrompt(context: ClassifierEmailContext): string {
  const bodyText = truncate(context.bodyText ?? context.bodyPreview, env.CLASSIFICATION_BODY_MAX_CHARS);
  const bodyHtml = context.bodyHtml ? truncate(context.bodyHtml, 4000) : undefined;
  const allowedCategories = EMAIL_CATEGORY_VALUES.join(', ');
  const allowedUrgencies = EMAIL_URGENCY_VALUES.join(', ');
  const allowedFinanceDocTypes = FINANCE_DOC_TYPE_VALUES.join(', ');
  const allowedSentimentLabels = SENTIMENT_VALUES.join(', ');

  return [
    'Classify the email and infer the likely next human action.',
    'Return JSON only. Do not wrap the JSON in markdown, prose, commentary, or code fences.',
    'The output must be a single JSON object that exactly matches the requested schema.',
    'Every required field must be present, even when the safest value is a low-confidence default.',
    `Allowed category values only: ${allowedCategories}.`,
    `Allowed urgency values only: ${allowedUrgencies}.`,
    `Allowed finance_doc_type values only: ${allowedFinanceDocTypes}.`,
    `Allowed sentiment.label values only: ${allowedSentimentLabels}.`,
    'All numeric fields must be JSON numbers, never strings: emergency_score, task_likelihood, confidence, explanation_json.sender_importance.score.',
    'explanation_json must always be present and must include summary, keywords, sender_importance, sentiment, detected_intent, urgency_signals, reply_signals, task_signals, and finance_signals.',
    'If the correct category is unclear, use "uncategorized" instead of inventing a new category label.',
    'If no finance document is clearly present, use finance_doc_type="unknown".',
    '',
    `Subject: ${context.subject || '(no subject)'}`,
    `From: ${context.fromName ? `${context.fromName} <${context.fromEmail}>` : context.fromEmail}`,
    `Received At: ${context.receivedAt ?? 'unknown'}`,
    `Sent At: ${context.sentAt ?? 'unknown'}`,
    `Source Folder: ${context.sourceFolder}`,
    `Importance: ${context.importance ?? 'unknown'}`,
    `Sender Importance Score: ${context.senderImportanceScore ?? 0}`,
    `Sender Relationship Notes: ${context.senderRelationshipNotes ?? 'none'}`,
    '',
    'Recipients:',
    formatRecipients(context),
    '',
    'Body Text:',
    bodyText ?? '(empty)',
    '',
    ...(bodyHtml
      ? [
          'Body HTML Excerpt:',
          bodyHtml,
          ''
        ]
      : []),
    'Classification guidance:',
    '- Use category=emergency only for clear high-severity operational, legal, safety, security, outage, or financial urgency.',
    '- Use category=system_alert for automated alerts, monitoring notifications, security notices, moderation events, or other machine-generated operational warnings.',
    '- needs_reply should be true only when a human response is likely expected.',
    '- task_likelihood should reflect whether a concrete follow-up task should be created.',
    '- finance_doc_type must be one of the allowed enum values only.',
    '- urgency must use one of the allowed enum values only and should reflect how quickly the user should look at this email.',
    '- explanation_json must be concise, evidence-based, and derived from the email content and metadata.',
    '- Do not emit category labels such as informational, routine, technical_alert, website_moderation, or any other label not in the allowed enum.',
    '- Marketing blasts, newsletters, and low-value notifications should not be marked as urgent unless the content clearly indicates otherwise.'
  ].join('\n');
}

export const classificationSystemPrompt = [
  'You are an email triage classifier for an executive assistant system.',
  'You must produce structured, deterministic JSON for downstream automation.',
  'Be conservative about emergencies and reply requirements.',
  'Base your decision only on the supplied email content and metadata.',
  'If a finance document type is not clearly present, use "unknown".',
  'If a category is uncertain, use "uncategorized" rather than creating a new label.',
  'Do not include markdown or prose outside the JSON object.',
  'Do not omit required fields and do not return numbers as strings.'
].join(' ');
