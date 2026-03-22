import { logger } from './logger';
import { env } from '../config/env';

type ShutdownHook = () => Promise<void>;

export function registerShutdownHooks(serviceName: string, hook: ShutdownHook): void {
  let shuttingDown = false;

  const handleSignal = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ service: serviceName, signal }, 'Shutdown signal received');
    const forceExitTimer = setTimeout(() => {
      logger.error({ service: serviceName, timeoutMs: env.SHUTDOWN_TIMEOUT_MS }, 'Shutdown timed out');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      await hook();
      clearTimeout(forceExitTimer);
      logger.info({ service: serviceName }, 'Shutdown completed');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error({ service: serviceName, err: error }, 'Shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  process.on('uncaughtException', (error) => {
    logger.fatal({ service: serviceName, err: error }, 'Uncaught exception');
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ service: serviceName, err: reason }, 'Unhandled promise rejection');
  });
}
