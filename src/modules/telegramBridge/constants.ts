import type { InboundUserActionType, NotificationAction } from '../notifications/types';
import type { ActionCommandDefinition } from './types';

export const TELEGRAM_SOURCE = 'telegram';
export const TELEGRAM_CHANNEL = 'telegram';

export const TELEGRAM_ACTIONS: Record<InboundUserActionType, ActionCommandDefinition> = {
  approve: {
    type: 'approve',
    code: 'ap',
    command: 'approve',
    replyHint: 'approve',
    label: 'Approve'
  },
  reject: {
    type: 'reject',
    code: 'rj',
    command: 'reject',
    replyHint: 'reject',
    label: 'Reject'
  },
  snooze: {
    type: 'snooze',
    code: 'sz',
    command: 'snooze',
    replyHint: 'snooze 60',
    label: 'Snooze'
  },
  mark_not_important: {
    type: 'mark_not_important',
    code: 'ni',
    command: 'notimportant',
    replyHint: 'not important',
    label: 'Not Important'
  },
  create_todo: {
    type: 'create_todo',
    code: 'td',
    command: 'todo',
    replyHint: 'create todo',
    label: 'Create Todo'
  },
  forward_to_bill_com: {
    type: 'forward_to_bill_com',
    code: 'bc',
    command: 'billcom',
    replyHint: 'forward bill.com',
    label: 'Forward to Bill.com'
  },
  file_to_onedrive: {
    type: 'file_to_onedrive',
    code: 'od',
    command: 'onedrive',
    replyHint: 'file onedrive',
    label: 'File to OneDrive'
  }
};

const ACTIONS_BY_CODE = Object.values(TELEGRAM_ACTIONS).reduce<Record<string, InboundUserActionType>>(
  (accumulator, action) => {
    accumulator[action.code] = action.type;
    return accumulator;
  },
  {}
);

export function getTelegramActionDefinition(actionType: InboundUserActionType): ActionCommandDefinition {
  return TELEGRAM_ACTIONS[actionType];
}

export function encodeTelegramCallbackData(notificationId: string, actionType: InboundUserActionType): string {
  return `ia:${TELEGRAM_ACTIONS[actionType].code}:${notificationId}`;
}

export function decodeTelegramCallbackData(
  value: string
): { notificationId: string; actionType: InboundUserActionType } | null {
  const match = /^ia:([a-z]{2}):([0-9a-f-]{36})$/i.exec(value.trim());

  if (!match) {
    return null;
  }

  const actionType = ACTIONS_BY_CODE[match[1].toLowerCase()];

  if (!actionType) {
    return null;
  }

  return {
    notificationId: match[2],
    actionType
  };
}

export function buildActionHint(actions: NotificationAction[]): string {
  return actions.map((action) => `\`${TELEGRAM_ACTIONS[action.type].replyHint}\``).join(', ');
}
