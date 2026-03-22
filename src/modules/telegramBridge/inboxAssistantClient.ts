import { env } from '../../config/env';
import type { OutboundNotification } from '../notifications/repositories/notificationRepository';
import type { InboundUserActionType } from '../notifications/types';
import type { DeliveryAckPayload, InboxActionPayload } from './types';

type JsonRecord = Record<string, unknown>;

export class InboxAssistantBridgeClient {
  private readonly baseUrl: string;

  constructor(baseUrl = env.TELEGRAM_BRIDGE_INBOX_ASSISTANT_BASE_URL) {
    if (!baseUrl) {
      throw new Error('TELEGRAM_BRIDGE_INBOX_ASSISTANT_BASE_URL is not configured');
    }

    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async listPendingNotifications(limit = 25): Promise<OutboundNotification[]> {
    const response = await this.requestJson(`/openclaw/notifications/outbound?limit=${limit}`);
    const notifications = response.notifications;

    if (!Array.isArray(notifications)) {
      throw new Error('OpenClaw bridge response did not include notifications[]');
    }

    return notifications as OutboundNotification[];
  }

  async recordDelivery(input: DeliveryAckPayload): Promise<JsonRecord> {
    return this.requestJson(`/openclaw/notifications/${input.notificationId}/deliveries`, {
      method: 'POST',
      body: JSON.stringify({
        channel: 'telegram',
        delivery_status: 'sent',
        external_delivery_id: input.externalDeliveryId,
        external_chat_id: input.externalChatId,
        idempotency_key: `telegram-delivery:${input.notificationId}:${input.externalDeliveryId}`,
        request_payload: input.requestPayload ?? {},
        response_payload: input.responsePayload ?? {}
      })
    });
  }

  async recordInboundAction(input: InboxActionPayload): Promise<JsonRecord> {
    return this.requestJson('/openclaw/actions', {
      method: 'POST',
      body: JSON.stringify({
        notification_id: input.notificationId,
        action_type: input.actionType satisfies InboundUserActionType,
        actor_id: input.actorId,
        actor_display_name: input.actorDisplayName,
        source: 'telegram',
        source_message_id: input.sourceMessageId,
        source_chat_id: input.sourceChatId,
        idempotency_key: input.idempotencyKey,
        payload: input.payload ?? {}
      })
    });
  }

  private async requestJson(path: string, init?: RequestInit): Promise<JsonRecord> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-openclaw-shared-secret': env.OPENCLAW_BRIDGE_SHARED_SECRET ?? '',
        ...(init?.headers ?? {})
      }
    });

    const text = await response.text();
    const parsed = text.length > 0 ? (JSON.parse(text) as JsonRecord) : {};

    if (!response.ok) {
      throw new Error(
        `Inbox assistant bridge request failed (${response.status}): ${text || response.statusText}`
      );
    }

    return parsed;
  }
}
