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
  MAIL_INGESTION_STATUS_LIMIT: z.coerce.number().int().positive().default(20)
});

const parsedEnv = envSchema.parse(process.env);

const databaseUrl =
  parsedEnv.DATABASE_URL ??
  `postgresql://${parsedEnv.POSTGRES_USER}:${parsedEnv.POSTGRES_PASSWORD}@${parsedEnv.POSTGRES_HOST}:${parsedEnv.POSTGRES_PORT}/${parsedEnv.POSTGRES_DB}`;

export const env = {
  ...parsedEnv,
  DATABASE_URL: databaseUrl,
  DATABASE_SSL_ENABLED: parsedEnv.DATABASE_SSL_ENABLED ?? false
};

export type AppEnv = typeof env;
