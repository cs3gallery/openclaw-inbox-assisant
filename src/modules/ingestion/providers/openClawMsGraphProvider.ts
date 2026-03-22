import { logger } from '../../../common/logger';
import { env } from '../../../config/env';
import { DEFAULT_FOLDER_NAME, MAIL_PROVIDER_NAME } from '../constants';
import type { MailProvider } from '../provider';
import type {
  ListMessagesParams,
  ListMessagesResult,
  MailFolder,
  MailProviderCapabilities
} from '../types';

type ConnectorConnectionRecord = {
  connection: {
    name: string;
    status: string;
    metadata?: Record<string, unknown>;
  };
};

type SearchMailResponse = {
  value?: Record<string, unknown>[];
  '@odata.nextLink'?: string;
  '@odata.context'?: string;
} & Record<string, unknown>;

type ConnectorRequestOptions = {
  method?: string;
  body?: Record<string, unknown>;
};

const capabilities: MailProviderCapabilities = {
  supportsFolderListing: false,
  supportsMessageListing: true,
  supportsMessageDetails: false,
  supportsAttachmentMetadataListing: false,
  supportsPagination: false,
  supportsCursorSync: false,
  supportsDeltaSync: false
};

export class OpenClawMsGraphProvider implements MailProvider {
  readonly providerName = MAIL_PROVIDER_NAME;

  getCapabilities(): MailProviderCapabilities {
    return capabilities;
  }

  async resolveConnectionName(connectionName?: string): Promise<string> {
    if (connectionName) {
      return connectionName;
    }

    const connections = await this.request<ConnectorConnectionRecord[]>('/connections');
    const activeConnections = connections.filter((entry) => entry.connection.status === 'active');
    const defaultConnection = activeConnections.find(
      (entry) => entry.connection.metadata?.isDefault === true
    );

    if (defaultConnection) {
      return defaultConnection.connection.name;
    }

    if (activeConnections.length === 1) {
      return activeConnections[0].connection.name;
    }

    throw new Error(
      'Unable to resolve a Microsoft Graph connection. Set OPENCLAW_MSGRAPH_CONNECTION_NAME or configure exactly one active/default connection.'
    );
  }

  async listFolders(connectionName?: string): Promise<MailFolder[]> {
    const resolvedConnection = await this.resolveConnectionName(connectionName);

    logger.warn(
      { provider: this.providerName, connectionName: resolvedConnection },
      'Connector does not expose folder listing; returning synthetic Inbox folder'
    );

    return [
      {
        id: DEFAULT_FOLDER_NAME,
        displayName: DEFAULT_FOLDER_NAME,
        synthetic: true
      }
    ];
  }

  async listMessages(params: ListMessagesParams): Promise<ListMessagesResult> {
    const resolvedConnectionName = await this.resolveConnectionName(params.connectionName);
    const normalizedFolder = params.folder.trim();

    if (normalizedFolder.toLowerCase() !== DEFAULT_FOLDER_NAME.toLowerCase()) {
      throw new Error(
        `Connector does not support folder-specific mail listing. Requested folder "${normalizedFolder}" is unsupported; only "${DEFAULT_FOLDER_NAME}" is available through the current plugin API.`
      );
    }

    const rawResponse = await this.request<SearchMailResponse>(
      `/graph/${resolvedConnectionName}/mail/search`,
      {
        method: 'POST',
        body: {
          authMode: params.authMode,
          top: params.pageSize,
          ...(params.query ? { query: params.query } : {})
        }
      }
    );

    return {
      connectionName: resolvedConnectionName,
      folder: DEFAULT_FOLDER_NAME,
      messages: Array.isArray(rawResponse.value) ? rawResponse.value : [],
      nextCursor: rawResponse['@odata.nextLink'],
      rawResponse
    };
  }

  private async request<T>(path: string, options: ConnectorRequestOptions = {}): Promise<T> {
    const response = await fetch(`${env.OPENCLAW_MSGRAPH_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-openclaw-shared-secret': env.OPENCLAW_MSGRAPH_SHARED_SECRET
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenClaw msgraph connector request failed with status ${response.status}: ${body}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

