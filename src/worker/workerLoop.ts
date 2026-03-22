import { logger } from '../common/logger';
import { env } from '../config/env';

export function startWorkerLoop(): () => void {
  logger.info('Worker loop started');

  const timer = setInterval(() => {
    logger.info({ service: 'worker' }, 'Worker heartbeat');
  }, env.WORKER_HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    logger.info('Worker loop stopped');
  };
}

