import { logger } from '../../common/logger';
import { env } from '../../config/env';
import type { OutboundNotification } from '../notifications/repositories/notificationRepository';
import type { InboundUserActionType } from '../notifications/types';
import {
  TELEGRAM_SOURCE,
  decodeTelegramCallbackData,
  getTelegramActionDefinition
} from './constants';
import { extractNotificationIdFromText, formatTelegramNotification } from './formatter';
import { InboxAssistantBridgeClient } from './inboxAssistantClient';
import { TelegramApiClient } from './telegramApiClient';
import type {
  DeliveryAckPayload,
  InboxActionPayload,
  ParsedTelegramAction,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate
} from './types';

type BridgeHealth = {
  service: 'telegram-bridge';
  status: 'ok' | 'degraded';
  timestamp: string;
  running: boolean;
  lastOutboundPollAt?: string;
  lastOutboundSuccessAt?: string;
  lastTelegramPollAt?: string;
  lastTelegramSuccessAt?: string;
  pendingDeliveryAcks: number;
  lastError?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    timeout.unref();
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value.trim());
}

function normalizeReplyAction(value: string): { actionType: InboundUserActionType; rest: string } | null {
  const normalized = value.trim().toLowerCase();

  if (normalized.startsWith('approve')) {
    return { actionType: 'approve', rest: normalized.slice('approve'.length).trim() };
  }

  if (normalized.startsWith('reject')) {
    return { actionType: 'reject', rest: normalized.slice('reject'.length).trim() };
  }

  if (normalized.startsWith('snooze')) {
    return { actionType: 'snooze', rest: normalized.slice('snooze'.length).trim() };
  }

  if (
    normalized.startsWith('not important') ||
    normalized.startsWith('notimportant') ||
    normalized.startsWith('mark not important')
  ) {
    return { actionType: 'mark_not_important', rest: '' };
  }

  if (normalized.startsWith('create todo') || normalized.startsWith('todo')) {
    return { actionType: 'create_todo', rest: normalized.replace(/^create todo|^todo/, '').trim() };
  }

  if (
    normalized.startsWith('forward bill.com') ||
    normalized.startsWith('forward to bill.com') ||
    normalized.startsWith('billcom') ||
    normalized.startsWith('bill.com')
  ) {
    return { actionType: 'forward_to_bill_com', rest: '' };
  }

  if (normalized.startsWith('file onedrive') || normalized.startsWith('onedrive')) {
    return { actionType: 'file_to_onedrive', rest: '' };
  }

  return null;
}

function buildInboundPayload(
  actionType: InboundUserActionType,
  trailingText: string
): Record<string, unknown> | undefined {
  if (actionType === 'snooze') {
    const minutesMatch = /(\d{1,4})/.exec(trailingText);
    return {
      duration_minutes: minutesMatch ? Number(minutesMatch[1]) : 60
    };
  }

  return undefined;
}

export class TelegramBridgeService {
  private running = false;
  private outboundLoopPromise?: Promise<void>;
  private updatesLoopPromise?: Promise<void>;
  private lastUpdateOffset = 0;
  private pendingDeliveryAcks = new Map<string, DeliveryAckPayload>();
  private lastOutboundPollAt?: string;
  private lastOutboundSuccessAt?: string;
  private lastTelegramPollAt?: string;
  private lastTelegramSuccessAt?: string;
  private lastError?: string;

  constructor(
    private readonly inboxAssistantClient: InboxAssistantBridgeClient,
    private readonly telegramApiClient: TelegramApiClient
  ) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.outboundLoopPromise = this.runOutboundLoop();
    this.updatesLoopPromise = this.runUpdatesLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  getHealth(): BridgeHealth {
    return {
      service: 'telegram-bridge',
      status: this.lastError ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      running: this.running,
      ...(this.lastOutboundPollAt ? { lastOutboundPollAt: this.lastOutboundPollAt } : {}),
      ...(this.lastOutboundSuccessAt ? { lastOutboundSuccessAt: this.lastOutboundSuccessAt } : {}),
      ...(this.lastTelegramPollAt ? { lastTelegramPollAt: this.lastTelegramPollAt } : {}),
      ...(this.lastTelegramSuccessAt ? { lastTelegramSuccessAt: this.lastTelegramSuccessAt } : {}),
      pendingDeliveryAcks: this.pendingDeliveryAcks.size,
      ...(this.lastError ? { lastError: this.lastError } : {})
    };
  }

  private async runOutboundLoop(): Promise<void> {
    while (this.running) {
      try {
        this.lastOutboundPollAt = new Date().toISOString();
        await this.retryPendingDeliveryAcks();
        const notifications = await this.inboxAssistantClient.listPendingNotifications(25);

        for (const notification of notifications) {
          if (!this.running || this.pendingDeliveryAcks.has(notification.id)) {
            continue;
          }

          await this.deliverNotification(notification);
        }

        this.lastOutboundSuccessAt = new Date().toISOString();
        this.lastError = undefined;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : 'Unknown outbound polling error';
        logger.error({ err: error }, 'Telegram bridge outbound poll failed');
      }

      await sleep(env.TELEGRAM_BRIDGE_OUTBOUND_POLL_INTERVAL_MS);
    }
  }

  private async runUpdatesLoop(): Promise<void> {
    while (this.running) {
      try {
        this.lastTelegramPollAt = new Date().toISOString();
        const updates = await this.telegramApiClient.getUpdates(
          this.lastUpdateOffset,
          env.TELEGRAM_BRIDGE_UPDATES_POLL_TIMEOUT_SECONDS
        );

        for (const update of updates) {
          this.lastUpdateOffset = update.update_id + 1;
          await this.handleUpdate(update);
        }

        this.lastTelegramSuccessAt = new Date().toISOString();
        this.lastError = undefined;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : 'Unknown Telegram polling error';
        logger.error({ err: error }, 'Telegram bridge update polling failed');
        await sleep(2000);
      }
    }
  }

  private async deliverNotification(notification: OutboundNotification): Promise<void> {
    const formatted = formatTelegramNotification({
      notification,
      actions: notification.actions
    });
    const chatId = this.resolveTargetChatId(notification);
    const sendResult = await this.telegramApiClient.sendMessage({
      chatId,
      text: formatted.text,
      replyMarkup: formatted.replyMarkup
    });
    const deliveryAck: DeliveryAckPayload = {
      notificationId: notification.id,
      externalDeliveryId: String(sendResult.message_id),
      externalChatId: String(sendResult.chat.id),
      requestPayload: {
        parse_mode: 'MarkdownV2',
        has_inline_keyboard: Boolean(formatted.replyMarkup)
      },
      responsePayload: {
        message_id: sendResult.message_id,
        chat_id: sendResult.chat.id
      }
    };

    try {
      await this.inboxAssistantClient.recordDelivery(deliveryAck);
      logger.info(
        {
          notificationId: notification.id,
          notificationType: notification.notificationType,
          chatId: String(sendResult.chat.id),
          messageId: sendResult.message_id
        },
        'Telegram bridge delivered notification'
      );
    } catch (error) {
      this.pendingDeliveryAcks.set(notification.id, deliveryAck);
      throw error;
    }
  }

  private async retryPendingDeliveryAcks(): Promise<void> {
    for (const [notificationId, payload] of this.pendingDeliveryAcks.entries()) {
      try {
        await this.inboxAssistantClient.recordDelivery(payload);
        this.pendingDeliveryAcks.delete(notificationId);
        logger.info({ notificationId }, 'Telegram bridge replayed delivery acknowledgement');
      } catch (error) {
        logger.warn({ err: error, notificationId }, 'Telegram bridge delivery acknowledgement retry failed');
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.message?.text) {
      await this.handleTextMessage(update.message);
    }
  }

  private async handleCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<void> {
    const message = callbackQuery.message;
    const data = callbackQuery.data;

    if (!message || !data || !this.isAllowedChatId(String(message.chat.id))) {
      return;
    }

    const parsed = decodeTelegramCallbackData(data);

    if (!parsed) {
      await this.telegramApiClient.answerCallbackQuery(callbackQuery.id, 'Unknown action');
      return;
    }

    await this.recordAction({
      notificationId: parsed.notificationId,
      actionType: parsed.actionType,
      actorId: callbackQuery.from.username ?? String(callbackQuery.from.id),
      actorDisplayName: [callbackQuery.from.first_name, callbackQuery.from.last_name]
        .filter(Boolean)
        .join(' ') || callbackQuery.from.username,
      sourceMessageId: String(message.message_id),
      sourceChatId: String(message.chat.id),
      idempotencyKey: `telegram-callback:${callbackQuery.id}`,
      payload: {
        via: 'inline_button',
        telegram_callback_id: callbackQuery.id,
        ...(parsed.actionType === 'snooze' ? { duration_minutes: 60 } : {})
      }
    });

    await this.telegramApiClient.answerCallbackQuery(
      callbackQuery.id,
      `${getTelegramActionDefinition(parsed.actionType).label} recorded`
    );
    await this.telegramApiClient.clearInlineKeyboard(String(message.chat.id), message.message_id).catch(() => undefined);
  }

  private async handleTextMessage(message: TelegramMessage): Promise<void> {
    if (!message.text || !this.isAllowedChatId(String(message.chat.id))) {
      return;
    }

    const parsed = this.parseTextAction(message);

    if (!parsed) {
      return;
    }

    const actor = message.from;
    await this.recordAction({
      notificationId: parsed.notificationId,
      actionType: parsed.actionType,
      actorId: actor?.username ?? String(actor?.id ?? message.chat.id),
      actorDisplayName: actor
        ? [actor.first_name, actor.last_name].filter(Boolean).join(' ') || actor.username
        : undefined,
      sourceMessageId: String(message.message_id),
      sourceChatId: String(message.chat.id),
      idempotencyKey: `telegram-message:${message.chat.id}:${message.message_id}`,
      payload: {
        via: 'message',
        ...(parsed.payload ?? {})
      }
    });

    if (message.reply_to_message?.message_id) {
      await this.telegramApiClient
        .clearInlineKeyboard(String(message.chat.id), message.reply_to_message.message_id)
        .catch(() => undefined);
    }
  }

  private parseTextAction(message: TelegramMessage): ParsedTelegramAction | null {
    const text = message.text?.trim();

    if (!text) {
      return null;
    }

    const commandMatch = /^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?$/i.exec(text);

    if (commandMatch) {
      const command = commandMatch[1].toLowerCase();
      const remainder = (commandMatch[2] ?? '').trim();
      const mapping: Record<string, InboundUserActionType> = {
        approve: 'approve',
        reject: 'reject',
        snooze: 'snooze',
        notimportant: 'mark_not_important',
        todo: 'create_todo',
        billcom: 'forward_to_bill_com',
        onedrive: 'file_to_onedrive'
      };
      const actionType = mapping[command];

      if (!actionType) {
        return null;
      }

      const notificationId = remainder
        .split(/\s+/)
        .find((token) => isUuid(token));

      if (!notificationId) {
        return null;
      }

      return {
        notificationId,
        actionType,
        payload: buildInboundPayload(actionType, remainder)
      };
    }

    const replyAction = normalizeReplyAction(text);

    if (!replyAction) {
      return null;
    }

    const repliedText = message.reply_to_message?.text;
    const notificationId = repliedText ? extractNotificationIdFromText(repliedText) : null;

    if (!notificationId) {
      return null;
    }

    return {
      notificationId,
      actionType: replyAction.actionType,
      payload: buildInboundPayload(replyAction.actionType, replyAction.rest)
    };
  }

  private async recordAction(input: InboxActionPayload): Promise<void> {
    await this.inboxAssistantClient.recordInboundAction(input);
    logger.info(
      {
        notificationId: input.notificationId,
        actionType: input.actionType,
        actorId: input.actorId,
        source: TELEGRAM_SOURCE
      },
      'Telegram bridge relayed inbound action'
    );
  }

  private resolveTargetChatId(notification: OutboundNotification): string {
    const metadataChatId =
      typeof notification.metadata.telegram_chat_id === 'string'
        ? notification.metadata.telegram_chat_id
        : undefined;

    const configuredChatId = metadataChatId ?? env.TELEGRAM_BRIDGE_CHAT_ID;

    if (!configuredChatId) {
      throw new Error('TELEGRAM_BRIDGE_CHAT_ID is not configured');
    }

    return configuredChatId;
  }

  private isAllowedChatId(chatId: string): boolean {
    const allowedChatIds = env.TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS;
    return allowedChatIds.length === 0 ? true : allowedChatIds.includes(chatId);
  }
}
