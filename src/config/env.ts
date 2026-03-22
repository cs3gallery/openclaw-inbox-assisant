import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('openclaw-inbox-assistant'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_HOST: z.string().min(1).default('0.0.0.0'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  WORKER_HOST: z.string().min(1).default('0.0.0.0'),
  WORKER_PORT: z.coerce.number().int().positive().default(3001),
  TELEGRAM_BRIDGE_HOST: z.string().min(1).default('0.0.0.0'),
  TELEGRAM_BRIDGE_PORT: z.coerce.number().int().positive().default(3002),
  TELEGRAM_BRIDGE_OUTBOUND_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  TELEGRAM_BRIDGE_UPDATES_POLL_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(50)
    .default(8),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  POSTGRES_HOST: z.string().min(1).default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().min(1).default('openclaw_inbox'),
  POSTGRES_USER: z.string().min(1).default('openclaw'),
  POSTGRES_PASSWORD: z.string().min(1).default('change-me'),
  POSTGRES_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),
  POSTGRES_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  REDIS_URL: z.string().url(),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  QDRANT_URL: z.string().url(),
  QDRANT_API_KEY: z.string().optional(),
  EMBEDDING_VECTOR_SIZE: z.coerce.number().int().positive().default(1536),
  QDRANT_COLLECTION_DISTANCE: z.enum(['Cosine', 'Euclid', 'Dot', 'Manhattan']).default('Cosine'),
  QDRANT_COLLECTION_ON_DISK_PAYLOAD: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  STARTUP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  STARTUP_INITIAL_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
  STARTUP_MAX_BACKOFF_MS: z.coerce.number().int().positive().default(10000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  OPENCLAW_MSGRAPH_BASE_URL: z.string().url(),
  OPENCLAW_MSGRAPH_SHARED_SECRET: z.string().min(1),
  OPENCLAW_MSGRAPH_CONNECTION_NAME: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  OPENCLAW_MSGRAPH_AUTH_MODE: z.enum(['delegated', 'auto']).default('delegated'),
  OPENCLAW_BRIDGE_SHARED_SECRET: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  OPENCLAW_TOOL_API_BEARER_TOKEN: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  TELEGRAM_BRIDGE_INBOX_ASSISTANT_BASE_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  TELEGRAM_BRIDGE_BOT_TOKEN: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  TELEGRAM_BRIDGE_CHAT_ID: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ?.split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    ),
  MAIL_INGESTION_FOLDERS: z
    .string()
    .default('Inbox')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    ),
  MAIL_INGESTION_PAGE_SIZE: z.coerce.number().int().positive().default(100),
  MAIL_INGESTION_POLL_WINDOW_MINUTES: z.coerce.number().int().positive().default(1440),
  MAIL_INGESTION_FALLBACK_LOOKBACK_MINUTES: z.coerce.number().int().positive().default(240),
  MAIL_INGESTION_STATUS_LIMIT: z.coerce.number().int().positive().default(20),
  CLASSIFICATION_PROVIDER: z.enum(['openclaw', 'openai']).default('openclaw'),
  CLASSIFICATION_MODEL: z.string().min(1).default('gpt-4o-mini'),
  CLASSIFICATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  OPENCLAW_INFERENCE_AUTH_MODE: z.enum(['bearer', 'shared_secret']).default('bearer'),
  OPENCLAW_INFERENCE_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  OPENCLAW_INFERENCE_BEARER_TOKEN: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  OPENCLAW_INFERENCE_SHARED_SECRET: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  OPENAI_BASE_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  CLASSIFICATION_VERSION: z.string().min(1).default('sprint-3'),
  CLASSIFICATION_BODY_MAX_CHARS: z.coerce.number().int().positive().default(12000),
  CLASSIFICATION_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  CLASSIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  CLASSIFICATION_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(15000),
  CLASSIFICATION_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(1800000),
  CLASSIFICATION_TASK_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  CLASSIFICATION_EMERGENCY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85)
});

const parsedEnv = envSchema.parse(process.env);

const databaseUrl =
  parsedEnv.DATABASE_URL ??
  `postgresql://${parsedEnv.POSTGRES_USER}:${parsedEnv.POSTGRES_PASSWORD}@${parsedEnv.POSTGRES_HOST}:${parsedEnv.POSTGRES_PORT}/${parsedEnv.POSTGRES_DB}`;

export const env = {
  ...parsedEnv,
  DATABASE_URL: databaseUrl,
  DATABASE_SSL_ENABLED: parsedEnv.DATABASE_SSL_ENABLED ?? false,
  OPENAI_BASE_URL: parsedEnv.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS:
    parsedEnv.TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS?.length
      ? parsedEnv.TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS
      : parsedEnv.TELEGRAM_BRIDGE_CHAT_ID
        ? [parsedEnv.TELEGRAM_BRIDGE_CHAT_ID]
        : []
};

export type AppEnv = typeof env;
