import { z } from 'zod';

import {
  EMAIL_CATEGORY_VALUES,
  EMAIL_URGENCY_VALUES,
  FINANCE_DOC_TYPE_VALUES,
  SENTIMENT_VALUES
} from './constants';

export type EmailCategory = (typeof EMAIL_CATEGORY_VALUES)[number];
export type EmailUrgency = (typeof EMAIL_URGENCY_VALUES)[number];
export type FinanceDocType = (typeof FINANCE_DOC_TYPE_VALUES)[number];

export type ClassificationRecipient = {
  recipientType: string;
  emailAddress: string;
  displayName?: string;
};

export type ClassifierEmailContext = {
  emailId: string;
  graphMessageId?: string;
  internetMessageId?: string;
  conversationId?: string;
  subject: string;
  fromEmail: string;
  fromName?: string;
  bodyText?: string;
  bodyHtml?: string;
  bodyPreview?: string;
  receivedAt?: string;
  sentAt?: string;
  sourceFolder: string;
  importance?: string;
  metadata: Record<string, unknown>;
  senderImportanceScore?: number;
  senderRelationshipNotes?: string;
  recipients: ClassificationRecipient[];
};

export const explanationSchema = z.object({
  summary: z.string().min(1).max(500),
  keywords: z.array(z.string().min(1)).max(20),
  sender_importance: z.object({
    score: z.number().min(0).max(1),
    reason: z.string().min(1).max(300)
  }),
  sentiment: z.object({
    label: z.enum(SENTIMENT_VALUES),
    reason: z.string().min(1).max(300)
  }),
  detected_intent: z.array(z.string().min(1)).max(10),
  urgency_signals: z.array(z.string().min(1)).max(10),
  reply_signals: z.array(z.string().min(1)).max(10),
  task_signals: z.array(z.string().min(1)).max(10),
  finance_signals: z.array(z.string().min(1)).max(10)
});

export const classificationOutputSchema = z.object({
  category: z.enum(EMAIL_CATEGORY_VALUES),
  urgency: z.enum(EMAIL_URGENCY_VALUES),
  emergency_score: z.number().min(0).max(1),
  needs_reply: z.boolean(),
  task_likelihood: z.number().min(0).max(1),
  finance_doc_type: z.enum(FINANCE_DOC_TYPE_VALUES),
  confidence: z.number().min(0).max(1),
  explanation_json: explanationSchema
});

export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;

export const classificationResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: [...EMAIL_CATEGORY_VALUES]
    },
    urgency: {
      type: 'string',
      enum: [...EMAIL_URGENCY_VALUES]
    },
    emergency_score: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    needs_reply: {
      type: 'boolean'
    },
    task_likelihood: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    finance_doc_type: {
      type: 'string',
      enum: [...FINANCE_DOC_TYPE_VALUES]
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    explanation_json: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        keywords: {
          type: 'array',
          items: { type: 'string' }
        },
        sender_importance: {
          type: 'object',
          additionalProperties: false,
          properties: {
            score: { type: 'number', minimum: 0, maximum: 1 },
            reason: { type: 'string' }
          },
          required: ['score', 'reason']
        },
        sentiment: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: {
              type: 'string',
              enum: [...SENTIMENT_VALUES]
            },
            reason: { type: 'string' }
          },
          required: ['label', 'reason']
        },
        detected_intent: {
          type: 'array',
          items: { type: 'string' }
        },
        urgency_signals: {
          type: 'array',
          items: { type: 'string' }
        },
        reply_signals: {
          type: 'array',
          items: { type: 'string' }
        },
        task_signals: {
          type: 'array',
          items: { type: 'string' }
        },
        finance_signals: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: [
        'summary',
        'keywords',
        'sender_importance',
        'sentiment',
        'detected_intent',
        'urgency_signals',
        'reply_signals',
        'task_signals',
        'finance_signals'
      ]
    }
  },
  required: [
    'category',
    'urgency',
    'emergency_score',
    'needs_reply',
    'task_likelihood',
    'finance_doc_type',
    'confidence',
    'explanation_json'
  ]
} as const;
