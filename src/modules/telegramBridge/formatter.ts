import type { NotificationAction } from '../notifications/types';
import { defaultDailyDigestActions } from '../notifications/types';
import type { OutboundNotification } from '../notifications/repositories/notificationRepository';
import { buildActionHint, encodeTelegramCallbackData } from './constants';
import type {
  FormattedTelegramNotification,
  NotificationFormatterInput,
  TelegramInlineKeyboardButton
} from './types';

function escapeTelegramMarkdown(value: string): string {
  return value.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function getTypeBanner(notification: OutboundNotification): string {
  switch (notification.notificationType) {
    case 'urgent_alert':
      return '*🚨 Urgent Alert*';
    case 'daily_digest':
      return '*🗓️ Daily Digest*';
    case 'approval_request':
      return '*✅ Approval Request*';
  }
}

function getActions(notification: OutboundNotification): NotificationAction[] {
  if (notification.actions.length > 0) {
    return notification.actions;
  }

  if (notification.notificationType === 'daily_digest') {
    return defaultDailyDigestActions;
  }

  return [];
}

function buildReplyMarkup(
  notification: OutboundNotification,
  actions: NotificationAction[]
): FormattedTelegramNotification['replyMarkup'] {
  if (actions.length === 0) {
    return undefined;
  }

  const buttons = actions.map<TelegramInlineKeyboardButton>((action) => ({
    text: action.label,
    callback_data: encodeTelegramCallbackData(notification.id, action.type)
  }));

  const inline_keyboard: TelegramInlineKeyboardButton[][] = [];

  for (let index = 0; index < buttons.length; index += 2) {
    inline_keyboard.push(buttons.slice(index, index + 2));
  }

  return {
    inline_keyboard
  };
}

export function formatTelegramNotification(
  input: NotificationFormatterInput
): FormattedTelegramNotification {
  const actions = getActions(input.notification);
  const commandHints = actions.length > 0 ? buildActionHint(actions) : undefined;
  const actionFooter =
    actions.length > 0
      ? `${escapeTelegramMarkdown('Reply with')} ${commandHints} ${escapeTelegramMarkdown('or tap the buttons below.')}`
      : 'No direct actions are configured for this notification\\.';

  return {
    text: [
      getTypeBanner(input.notification),
      input.notification.bodyMarkdown,
      actionFooter,
      `${escapeTelegramMarkdown('Notification ID')}: \`${input.notification.id}\``
    ].join('\n\n'),
    replyMarkup: buildReplyMarkup(input.notification, actions)
  };
}

export function extractNotificationIdFromText(value: string): string | null {
  const match = /Notification ID:\s*([0-9a-f-]{36})/i.exec(value);
  return match?.[1] ?? null;
}
