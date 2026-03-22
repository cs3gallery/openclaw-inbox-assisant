export type MailRecipientType = 'to' | 'cc' | 'bcc' | 'reply_to';

export type MailRecipient = {
  emailAddress: string;
  displayName?: string;
};

export type MailAttachmentMetadata = {
  graphAttachmentId?: string;
  fileName: string;
  contentType?: string;
  sizeBytes?: number;
  metadata: Record<string, unknown>;
};

export type CanonicalEmail = {
  sourceProvider: string;
  sourceConnectionName: string;
  sourceFolder: string;
  graphMessageId: string;
  internetMessageId?: string;
  conversationId?: string;
  conversationIndex?: string;
  subject: string;
  fromEmail: string;
  fromName?: string;
  sender: MailRecipient;
  toRecipients: MailRecipient[];
  ccRecipients: MailRecipient[];
  bccRecipients: MailRecipient[];
  replyToRecipients: MailRecipient[];
  receivedAt?: string;
  sentAt?: string;
  sourceLastModifiedAt?: string;
  bodyPreview?: string;
  bodyText?: string;
  bodyHtml?: string;
  bodyContentType?: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance?: string;
  metadata: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
  attachments: MailAttachmentMetadata[];
};

export type NormalizedEmailRecipient = {
  recipientType: MailRecipientType;
  emailAddress: string;
  displayName?: string;
  position: number;
};

export type MailProviderCapabilities = {
  supportsFolderListing: boolean;
  supportsMessageListing: boolean;
  supportsMessageDetails: boolean;
  supportsAttachmentMetadataListing: boolean;
  supportsPagination: boolean;
  supportsCursorSync: boolean;
  supportsDeltaSync: boolean;
};

export type MailFolder = {
  id: string;
  displayName: string;
  synthetic?: boolean;
};

export type MailProviderMessage = Record<string, unknown>;

export type ListMessagesParams = {
  connectionName?: string;
  folder: string;
  pageSize: number;
  query?: string;
  authMode: 'delegated' | 'auto';
};

export type ListMessagesResult = {
  connectionName: string;
  folder: string;
  messages: MailProviderMessage[];
  nextCursor?: string;
  rawResponse: Record<string, unknown>;
};

export type IngestionRunSummary = {
  runId: string;
  provider: string;
  connectionName: string;
  folders: string[];
  status: 'running' | 'completed' | 'failed';
  syncMode: string;
  triggerSource: string;
  requestedBy?: string;
  startedAt: string;
  completedAt?: string;
  messagesSeen: number;
  messagesProcessed: number;
  messagesInserted: number;
  messagesUpdated: number;
  attachmentsSeen: number;
  jobsPublished: number;
  cursorBefore?: string;
  cursorAfter?: string;
  error?: string;
  metadata: Record<string, unknown>;
};

