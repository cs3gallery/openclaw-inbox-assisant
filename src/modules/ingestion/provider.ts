import type { MailFolder, MailProviderCapabilities, ListMessagesParams, ListMessagesResult } from './types';

export interface MailProvider {
  readonly providerName: string;
  getCapabilities(): MailProviderCapabilities;
  resolveConnectionName(connectionName?: string): Promise<string>;
  listFolders(connectionName?: string): Promise<MailFolder[]>;
  listMessages(params: ListMessagesParams): Promise<ListMessagesResult>;
}

