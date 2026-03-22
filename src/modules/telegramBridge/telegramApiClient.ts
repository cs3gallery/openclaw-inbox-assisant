import { env } from '../../config/env';
import type {
  TelegramReplyMarkup,
  TelegramUpdate
} from './types';

type TelegramApiResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
};

type TelegramSendMessageResult = {
  message_id: number;
  chat: {
    id: number;
  };
};

export class TelegramApiClient {
  private readonly botToken: string;

  constructor(botToken = env.TELEGRAM_BRIDGE_BOT_TOKEN) {
    if (!botToken) {
      throw new Error('TELEGRAM_BRIDGE_BOT_TOKEN is not configured');
    }

    this.botToken = botToken;
  }

  async sendMessage(input: {
    chatId: string;
    text: string;
    replyMarkup?: TelegramReplyMarkup;
  }): Promise<TelegramSendMessageResult> {
    return this.request<TelegramSendMessageResult>('sendMessage', {
      chat_id: input.chatId,
      text: input.text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {})
    });
  }

  async getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    return this.request<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ['message', 'callback_query']
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text: string): Promise<boolean> {
    return this.request<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false
    });
  }

  async clearInlineKeyboard(chatId: string, messageId: number): Promise<boolean> {
    return this.request<boolean>('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: []
      }
    });
  }

  private async request<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    const parsed = text.length > 0 ? (JSON.parse(text) as TelegramApiResponse<T>) : undefined;

    if (!response.ok || !parsed?.ok) {
      throw new Error(
        `Telegram API ${method} failed (${response.status}): ${parsed?.description ?? text ?? 'Unknown error'}`
      );
    }

    return parsed.result;
  }
}
