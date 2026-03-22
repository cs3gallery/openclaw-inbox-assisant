import { logger } from './logger';

type ShutdownHook = () => Promise<void>;

export function registerShutdownHooks(serviceName: string, hook: ShutdownHook): void {
  let shuttingDown = false;

  const handleSignal = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ service: serviceName, signal }, 'Shutdown signal received');

    try {
      await hook();
      logger.info({ service: serviceName }, 'Shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({ service: serviceName, err: error }, 'Shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
}

