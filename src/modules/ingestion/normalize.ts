import type {
  CanonicalEmail,
  MailAttachmentMetadata,
  MailProviderMessage,
  MailRecipient,
  NormalizedEmailRecipient
} from './types';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeParticipant(value: unknown): MailRecipient | undefined {
  const record = asRecord(value);
  const emailAddress = asRecord(record?.emailAddress);
  const email = asString(emailAddress?.address);

  if (!email) {
    return undefined;
  }

  return {
    emailAddress: email,
    ...(asString(emailAddress?.name) ? { displayName: asString(emailAddress?.name) } : {})
  };
}

function normalizeRecipientList(value: unknown): MailRecipient[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeParticipant(entry))
    .filter((entry): entry is MailRecipient => entry !== undefined);
}

function normalizeAttachments(value: unknown): MailAttachmentMetadata[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const attachments: MailAttachmentMetadata[] = [];

  for (const entry of value) {
    const record = asRecord(entry);
    const fileName = asString(record?.name);

    if (!fileName) {
      continue;
    }

    attachments.push({
      fileName,
      ...(asString(record?.id) ? { graphAttachmentId: asString(record?.id) } : {}),
      ...(asString(record?.contentType) ? { contentType: asString(record?.contentType) } : {}),
      ...(asNumber(record?.size) !== undefined ? { sizeBytes: asNumber(record?.size) } : {}),
      metadata: record ?? {}
    });
  }

  return attachments;
}

function normalizeBody(
  message: Record<string, unknown>
): Pick<CanonicalEmail, 'bodyText' | 'bodyHtml' | 'bodyContentType' | 'bodyPreview'> {
  const body = asRecord(message.body);
  const bodyContent = asString(body?.content);
  const bodyContentType = asString(body?.contentType)?.toLowerCase();
  const bodyPreview = asString(message.bodyPreview);

  if (!bodyContent) {
    return {
      ...(bodyPreview ? { bodyPreview, bodyText: bodyPreview } : {})
    };
  }

  if (bodyContentType === 'html') {
    return {
      bodyHtml: bodyContent,
      bodyText: stripHtml(bodyContent),
      bodyContentType: 'html',
      ...(bodyPreview ? { bodyPreview } : {})
    };
  }

  return {
    bodyText: bodyContent,
    bodyContentType: bodyContentType ?? 'text',
    ...(bodyPreview ? { bodyPreview } : {})
  };
}

export function normalizeProviderMessage(
  sourceConnectionName: string,
  sourceFolder: string,
  message: MailProviderMessage
): CanonicalEmail {
  const graphMessageId = asString(message.id);
  const sender = normalizeParticipant(message.sender) ?? normalizeParticipant(message.from);

  if (!graphMessageId) {
    throw new Error('Connector message payload is missing id');
  }

  if (!sender) {
    throw new Error(`Connector message ${graphMessageId} is missing sender email address`);
  }

  const body = normalizeBody(message);
  const replyToRecipients = normalizeRecipientList(message.replyTo);
  const attachments = normalizeAttachments(message.attachments);

  return {
    sourceProvider: 'openclaw_msgraph_connector',
    sourceConnectionName,
    sourceFolder,
    graphMessageId,
    internetMessageId: asString(message.internetMessageId),
    conversationId: asString(message.conversationId),
    conversationIndex: asString(message.conversationIndex),
    subject: asString(message.subject) ?? '',
    fromEmail: sender.emailAddress,
    fromName: sender.displayName,
    sender,
    toRecipients: normalizeRecipientList(message.toRecipients),
    ccRecipients: normalizeRecipientList(message.ccRecipients),
    bccRecipients: normalizeRecipientList(message.bccRecipients),
    replyToRecipients,
    receivedAt: asString(message.receivedDateTime),
    sentAt: asString(message.sentDateTime),
    sourceLastModifiedAt: asString(message.lastModifiedDateTime),
    ...body,
    isRead: asBoolean(message.isRead),
    hasAttachments: asBoolean(message.hasAttachments) || attachments.length > 0,
    importance: asString(message.importance),
    metadata: {
      parentFolderId: asString(message.parentFolderId),
      webLink: asString(message.webLink),
      inferenceClassification: asString(message.inferenceClassification),
      ...(Array.isArray(message.categories) ? { categories: message.categories } : {})
    },
    rawPayload: message,
    attachments
  };
}

export function flattenRecipients(email: CanonicalEmail): NormalizedEmailRecipient[] {
  return [
    ...email.toRecipients.map((recipient, position) => ({
      recipientType: 'to' as const,
      emailAddress: recipient.emailAddress,
      displayName: recipient.displayName,
      position
    })),
    ...email.ccRecipients.map((recipient, position) => ({
      recipientType: 'cc' as const,
      emailAddress: recipient.emailAddress,
      displayName: recipient.displayName,
      position
    })),
    ...email.bccRecipients.map((recipient, position) => ({
      recipientType: 'bcc' as const,
      emailAddress: recipient.emailAddress,
      displayName: recipient.displayName,
      position
    })),
    ...email.replyToRecipients.map((recipient, position) => ({
      recipientType: 'reply_to' as const,
      emailAddress: recipient.emailAddress,
      displayName: recipient.displayName,
      position
    }))
  ];
}
