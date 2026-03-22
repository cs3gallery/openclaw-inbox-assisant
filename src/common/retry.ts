import { logger } from './logger';

type RetryOptions = {
  operation: string;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  factor?: number;
};

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function withRetry<T>(
  callback: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const factor = options.factor ?? 2;
  let attempt = 1;
  let delayMs = options.initialDelayMs;

  while (true) {
    try {
      return await callback(attempt);
    } catch (error) {
      if (attempt >= options.maxAttempts) {
        logger.error(
          { err: error, operation: options.operation, attempts: attempt },
          'Operation failed after retries'
        );
        throw error;
      }

      logger.warn(
        { err: error, operation: options.operation, attempt, retryInMs: delayMs },
        'Operation failed, retrying'
      );

      await sleep(delayMs);
      attempt += 1;
      delayMs = Math.min(Math.round(delayMs * factor), options.maxDelayMs);
    }
  }
}

