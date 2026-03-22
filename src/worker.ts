import { logger } from './common/logger';
import { registerShutdownHooks } from './common/shutdown';
import { env } from './config/env';
import { bootstrapDependencies } from './bootstrap/bootstrap';
import { closePostgresPool } from './db/postgres/client';
import { closeRedis } from './db/redis/client';
import { createClassificationInferenceProvider } from './modules/classification/createInferenceProvider';
import { ClassificationRepository } from './modules/classification/repositories/classificationRepository';
import { ClassificationEmailRepository } from './modules/classification/repositories/emailRepository';
import { EmailClassificationService } from './modules/classification/service';
import { ActionQueueRepository } from './modules/ingestion/repositories/actionQueueRepository';
import { createWorkerServer } from './worker/createWorkerServer';
import { startWorkerLoop } from './worker/workerLoop';

async function startWorker(): Promise<void> {
  await bootstrapDependencies('worker');

  logger.info(
    {
      classificationProvider: env.CLASSIFICATION_PROVIDER,
      classificationModel: env.CLASSIFICATION_MODEL,
      openClawInferenceAuthMode: env.OPENCLAW_INFERENCE_AUTH_MODE,
      openClawInferenceUrlConfigured: Boolean(env.OPENCLAW_INFERENCE_URL),
      openClawBearerTokenConfigured: Boolean(env.OPENCLAW_INFERENCE_BEARER_TOKEN),
      openClawSharedSecretConfigured: Boolean(env.OPENCLAW_INFERENCE_SHARED_SECRET),
      openAiFallbackConfigured: Boolean(env.OPENAI_API_KEY)
    },
    'Classification worker configuration resolved'
  );

  if (env.CLASSIFICATION_PROVIDER === 'openclaw' && !env.OPENCLAW_INFERENCE_URL) {
    throw new Error(
      'OPENCLAW_INFERENCE_URL is required to start the classification worker when CLASSIFICATION_PROVIDER=openclaw'
    );
  }

  if (
    env.CLASSIFICATION_PROVIDER === 'openclaw' &&
    env.OPENCLAW_INFERENCE_AUTH_MODE === 'bearer' &&
    !env.OPENCLAW_INFERENCE_BEARER_TOKEN
  ) {
    throw new Error(
      'OPENCLAW_INFERENCE_BEARER_TOKEN is required when CLASSIFICATION_PROVIDER=openclaw and OPENCLAW_INFERENCE_AUTH_MODE=bearer'
    );
  }

  if (
    env.CLASSIFICATION_PROVIDER === 'openclaw' &&
    env.OPENCLAW_INFERENCE_AUTH_MODE === 'shared_secret' &&
    !env.OPENCLAW_INFERENCE_SHARED_SECRET
  ) {
    throw new Error(
      'OPENCLAW_INFERENCE_SHARED_SECRET is required when CLASSIFICATION_PROVIDER=openclaw and OPENCLAW_INFERENCE_AUTH_MODE=shared_secret'
    );
  }

  if (env.CLASSIFICATION_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required to start the classification worker when CLASSIFICATION_PROVIDER=openai'
    );
  }

  const server = await createWorkerServer();
  const stopWorkerLoop = startWorkerLoop({
    emailClassificationService: new EmailClassificationService(
      new ActionQueueRepository(),
      new ClassificationEmailRepository(),
      new ClassificationRepository(),
      createClassificationInferenceProvider()
    )
  });

  registerShutdownHooks('worker', async () => {
    stopWorkerLoop();
    await server.close();
    await closeRedis();
    await closePostgresPool();
  });

  await server.listen({
    host: env.WORKER_HOST,
    port: env.WORKER_PORT
  });

  logger.info({ host: env.WORKER_HOST, port: env.WORKER_PORT }, 'Worker service started');
}

startWorker().catch(async (error) => {
  logger.fatal({ err: error }, 'Worker failed to start');
  await closeRedis().catch(() => undefined);
  await closePostgresPool().catch(() => undefined);
  process.exit(1);
});
