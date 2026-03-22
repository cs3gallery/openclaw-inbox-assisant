import { logger } from './common/logger';
import { registerShutdownHooks } from './common/shutdown';
import { env } from './config/env';
import { createTelegramBridgeServer } from './modules/telegramBridge/server';
import { TelegramBridgeService } from './modules/telegramBridge/service';
import { InboxAssistantBridgeClient } from './modules/telegramBridge/inboxAssistantClient';
import { TelegramApiClient } from './modules/telegramBridge/telegramApiClient';

function assertTelegramBridgeConfig(): void {
  if (!env.OPENCLAW_BRIDGE_SHARED_SECRET) {
    throw new Error('OPENCLAW_BRIDGE_SHARED_SECRET is required to start the Telegram bridge');
  }

  if (!env.TELEGRAM_BRIDGE_INBOX_ASSISTANT_BASE_URL) {
    throw new Error('TELEGRAM_BRIDGE_INBOX_ASSISTANT_BASE_URL is required to start the Telegram bridge');
  }

  if (!env.TELEGRAM_BRIDGE_BOT_TOKEN) {
    throw new Error('TELEGRAM_BRIDGE_BOT_TOKEN is required to start the Telegram bridge');
  }

  if (!env.TELEGRAM_BRIDGE_CHAT_ID) {
    throw new Error('TELEGRAM_BRIDGE_CHAT_ID is required to start the Telegram bridge');
  }
}

async function startTelegramBridge(): Promise<void> {
  assertTelegramBridgeConfig();

  const bridgeService = new TelegramBridgeService(
    new InboxAssistantBridgeClient(),
    new TelegramApiClient()
  );
  await bridgeService.start();

  const server = await createTelegramBridgeServer(bridgeService);

  registerShutdownHooks('telegram-bridge', async () => {
    await server.close();
    await bridgeService.stop();
  });

  await server.listen({
    host: env.TELEGRAM_BRIDGE_HOST,
    port: env.TELEGRAM_BRIDGE_PORT
  });

  logger.info(
    {
      service: 'telegram-bridge',
      host: env.TELEGRAM_BRIDGE_HOST,
      port: env.TELEGRAM_BRIDGE_PORT,
      inboxAssistantBaseUrl: env.TELEGRAM_BRIDGE_INBOX_ASSISTANT_BASE_URL,
      allowedChatIds: env.TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS
    },
    'Telegram bridge started'
  );
}

startTelegramBridge().catch((error) => {
  logger.fatal({ err: error, service: 'telegram-bridge' }, 'Telegram bridge failed to start');
  process.exit(1);
});
