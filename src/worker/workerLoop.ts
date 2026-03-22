import { logger } from '../common/logger';
import { env } from '../config/env';
import type { EmailClassificationService } from '../modules/classification/service';

type WorkerLoopOptions = {
  emailClassificationService: EmailClassificationService;
};

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    timer.unref();
  });
}

export function startWorkerLoop(options: WorkerLoopOptions): () => void {
  let stopped = false;

  logger.info('Worker loop started');

  const heartbeatTimer = setInterval(() => {
    logger.info({ service: 'worker' }, 'Worker heartbeat');
  }, env.WORKER_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();

  const loop = async (): Promise<void> => {
    while (!stopped) {
      try {
        const outcome = await options.emailClassificationService.processNextQueuedEmail();

        if (!outcome) {
          await sleep(env.CLASSIFICATION_POLL_INTERVAL_MS);
        }
      } catch (error) {
        logger.error({ err: error }, 'Worker loop iteration failed');
        await sleep(env.CLASSIFICATION_POLL_INTERVAL_MS);
      }
    }
  };

  void loop();

  return () => {
    stopped = true;
    clearInterval(heartbeatTimer);
    logger.info('Worker loop stopped');
  };
}
