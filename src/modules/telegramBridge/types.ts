import type {
  InboundUserActionType,
  NotificationAction
} from '../notifications/types';
import type { OutboundNotification } from '../notifications/repositories/notificationRepository';

export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

export type FormattedTelegramNotification = {
  text: string;
  replyMarkup?: TelegramReplyMarkup;
};

export type TelegramChat = {
  id: number | string;
  type: string;
};

export type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  text?: string;
  date?: number;
  reply_to_message?: TelegramMessage;
  from?: TelegramUser;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type InboxActionPayload = {
  notificationId: string;
  actionType: InboundUserActionType;
  actorId: string;
  actorDisplayName?: string;
  sourceMessageId?: string;
  sourceChatId?: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
};

export type DeliveryAckPayload = {
  notificationId: string;
  externalDeliveryId: string;
  externalChatId: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
};

export type ParsedTelegramAction = {
  notificationId: string;
  actionType: InboundUserActionType;
  payload?: Record<string, unknown>;
};

export type ActionCommandDefinition = {
  type: InboundUserActionType;
  code: string;
  command: string;
  replyHint: string;
  label: string;
};

export type NotificationFormatterInput = {
  notification: OutboundNotification;
  actions: NotificationAction[];
};
