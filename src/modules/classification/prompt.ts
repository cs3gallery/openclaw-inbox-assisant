import { env } from '../../config/env';
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

  return [
    'Classify the email and infer the likely next human action.',
    'Return only the JSON object that matches the requested schema.',
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
    '- needs_reply should be true only when a human response is likely expected.',
    '- task_likelihood should reflect whether a concrete follow-up task should be created.',
    '- finance_doc_type should be one of receipt, invoice, quote, purchase_confirmation, or unknown.',
    '- urgency should reflect how quickly the user should look at this email.',
    '- explanation_json must be concise, evidence-based, and derived from the email content.',
    '- Marketing blasts, newsletters, and low-value notifications should not be marked as urgent unless the content clearly indicates otherwise.'
  ].join('\n');
}

export const classificationSystemPrompt = [
  'You are an email triage classifier for an executive assistant system.',
  'You must produce structured, deterministic JSON for downstream automation.',
  'Be conservative about emergencies and reply requirements.',
  'Base your decision only on the supplied email content and metadata.',
  'If a finance document type is not clearly present, use "unknown".',
  'Do not include markdown or prose outside the JSON object.'
].join(' ');
