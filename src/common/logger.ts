import pino from 'pino';

import { env } from '../config/env';

export const loggerOptions = {
  level: env.LOG_LEVEL,
  name: env.APP_NAME,
  base: undefined
} as const;

export const logger = pino(loggerOptions);

