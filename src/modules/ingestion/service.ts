import { logger } from '../../common/logger';
import { env } from '../../config/env';
import { CLASSIFY_EMAIL_ACTION, DEFAULT_FOLDER_NAME, MAIL_PROVIDER_NAME, SYNC_RESOURCE_TYPE_MAIL_FOLDER } from './constants';
import { normalizeProviderMessage } from './normalize';
import type { MailProvider } from './provider';
import { IngestionRunsRepository } from './repositories/ingestionRunsRepository';
import { MailIngestionRepository } from './repositories/mailIngestionRepository';
import { SyncStateRepository, type SyncState } from './repositories/syncStateRepository';
import type { IngestionRunSummary } from './types';
import { MailQueuePublisher } from './queuePublisher';

type TriggerMailIngestionInput = {
  connectionName?: string;
  folders?: string[];
  pageSize?: number;
  requestedBy?: string;
  triggerSource: 'manual' | 'api';
};

type IngestionStatus = {
  provider: string;
  connectionName?: string;
  configuredFolders: string[];
  capabilities: ReturnType<MailProvider['getCapabilities']>;
  recentRuns: IngestionRunSummary[];
  syncState: SyncState[];
  queueActionType: string;
  connector: {
    reachable: boolean;
    error?: string;
  };
};

type IngestionCounters = {
  messagesSeen: number;
  messagesProcessed: number;
  messagesInserted: number;
  messagesUpdated: number;
  attachmentsSeen: number;
  jobsPublished: number;
};

function parseFolderList(folders?: string[]): string[] {
  const configured = folders && folders.length > 0 ? folders : env.MAIL_INGESTION_FOLDERS;
  return Array.from(
    new Set(
      configured
        .map((folder) => folder.trim())
        .filter((folder) => folder.length > 0)
    )
  );
}

function clampPageSize(pageSize?: number): number {
  if (!pageSize) {
    return env.MAIL_INGESTION_PAGE_SIZE;
  }

  return Math.min(Math.max(pageSize, 1), 250);
}

function computeThreshold(syncState: SyncState | null, now: Date): Date {
  if (syncState?.lastSeenReceivedAt) {
    return new Date(
      new Date(syncState.lastSeenReceivedAt).getTime() -
        env.MAIL_INGESTION_FALLBACK_LOOKBACK_MINUTES * 60 * 1000
    );
  }

  return new Date(now.getTime() - env.MAIL_INGESTION_POLL_WINDOW_MINUTES * 60 * 1000);
}

function isMessageInScope(
  normalized: ReturnType<typeof normalizeProviderMessage>,
  threshold: Date
): boolean {
  const receivedAt = normalized.receivedAt ? new Date(normalized.receivedAt) : null;
  const modifiedAt = normalized.sourceLastModifiedAt ? new Date(normalized.sourceLastModifiedAt) : null;

  if (receivedAt && !Number.isNaN(receivedAt.getTime()) && receivedAt >= threshold) {
    return true;
  }

  if (modifiedAt && !Number.isNaN(modifiedAt.getTime()) && modifiedAt >= threshold) {
    return true;
  }

  return false;
}

function maxIsoTimestamp(values: Array<string | undefined>, fallback?: string): string | undefined {
  const timestamps = values
    .map((value) => (value ? new Date(value) : null))
    .filter((value): value is Date => value !== null && !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  return timestamps[0]?.toISOString() ?? fallback;
}

export class MailIngestionService {
  constructor(
    private readonly mailProvider: MailProvider,
    private readonly mailIngestionRepository: MailIngestionRepository,
    private readonly ingestionRunsRepository: IngestionRunsRepository,
    private readonly syncStateRepository: SyncStateRepository,
    private readonly mailQueuePublisher: MailQueuePublisher
  ) {}

  async triggerManualIngestion(input: TriggerMailIngestionInput): Promise<IngestionRunSummary> {
    const resolvedConnectionName = await this.mailProvider.resolveConnectionName(
      input.connectionName ?? env.OPENCLAW_MSGRAPH_CONNECTION_NAME
    );
    const folders = parseFolderList(input.folders);

    if (folders.length === 0) {
      throw new Error('At least one mail folder must be configured for ingestion');
    }

    const unsupportedFolders = folders.filter(
      (folder) => folder.toLowerCase() !== DEFAULT_FOLDER_NAME.toLowerCase()
    );

    if (unsupportedFolders.length === folders.length) {
      throw new Error(
        `Configured folders are unsupported by the current connector: ${unsupportedFolders.join(', ')}. Only Inbox is available through the inspected plugin API.`
      );
    }

    const effectiveFolders = folders.filter(
      (folder) => folder.toLowerCase() === DEFAULT_FOLDER_NAME.toLowerCase()
    );
    const pageSize = clampPageSize(input.pageSize);

    const run = await this.ingestionRunsRepository.startRun({
      provider: this.mailProvider.providerName,
      connectionName: resolvedConnectionName,
      folders: effectiveFolders,
      syncMode: this.mailProvider.getCapabilities().supportsCursorSync ? 'cursor' : 'fallback_timestamp_window',
      triggerSource: input.triggerSource,
      requestedBy: input.requestedBy,
      metadata: {
        capabilities: this.mailProvider.getCapabilities(),
        pageSize,
        configuredFolders: folders,
        skippedUnsupportedFolders: unsupportedFolders
      }
    });

    logger.info(
      {
        runId: run.runId,
        provider: this.mailProvider.providerName,
        connectionName: resolvedConnectionName,
        folders: effectiveFolders,
        pageSize
      },
      'Starting mail ingestion run'
    );

    const counters: IngestionCounters = {
      messagesSeen: 0,
      messagesProcessed: 0,
      messagesInserted: 0,
      messagesUpdated: 0,
      attachmentsSeen: 0,
      jobsPublished: 0
    };

    const now = new Date();
    let maxReceivedAt: string | undefined;
    let maxModifiedAt: string | undefined;

    try {
      for (const folder of effectiveFolders) {
        const syncState = await this.syncStateRepository.get(
          this.mailProvider.providerName,
          resolvedConnectionName,
          SYNC_RESOURCE_TYPE_MAIL_FOLDER,
          folder
        );
        const threshold = computeThreshold(syncState, now);
        const listResult = await this.mailProvider.listMessages({
          connectionName: resolvedConnectionName,
          folder,
          pageSize,
          authMode: env.OPENCLAW_MSGRAPH_AUTH_MODE
        });

        counters.messagesSeen += listResult.messages.length;

        for (const rawMessage of listResult.messages) {
          const normalized = normalizeProviderMessage(resolvedConnectionName, folder, rawMessage);

          if (!isMessageInScope(normalized, threshold)) {
            continue;
          }

          counters.messagesProcessed += 1;
          const persisted = await this.mailIngestionRepository.persistEmail(normalized);

          if (persisted.inserted) {
            counters.messagesInserted += 1;
            const queuePublished = await this.mailQueuePublisher.publishClassifyEmail({
              email_id: persisted.emailId,
              graph_message_id: normalized.graphMessageId,
              source_folder: folder,
              received_at: normalized.receivedAt
            });

            if (queuePublished) {
              counters.jobsPublished += 1;
            }
          } else {
            counters.messagesUpdated += 1;
          }

          counters.attachmentsSeen += persisted.attachmentsSeen;
          maxReceivedAt = maxIsoTimestamp([maxReceivedAt, normalized.receivedAt], maxReceivedAt);
          maxModifiedAt = maxIsoTimestamp(
            [maxModifiedAt, normalized.sourceLastModifiedAt],
            maxModifiedAt
          );
        }

        await this.syncStateRepository.upsert({
          provider: this.mailProvider.providerName,
          connectionName: resolvedConnectionName,
          resourceType: SYNC_RESOURCE_TYPE_MAIL_FOLDER,
          resourceKey: folder,
          lastSuccessfulSyncAt: new Date().toISOString(),
          lastSeenReceivedAt: maxReceivedAt ?? syncState?.lastSeenReceivedAt,
          lastSeenSourceUpdatedAt: maxModifiedAt ?? syncState?.lastSeenSourceUpdatedAt,
          lastRunId: run.runId,
          metadata: {
            thresholdAppliedAt: threshold.toISOString(),
            capabilities: this.mailProvider.getCapabilities(),
            pageSize,
            nextCursorObserved: listResult.nextCursor ?? null,
            note: this.mailProvider.getCapabilities().supportsCursorSync
              ? 'cursor sync available'
              : 'fallback timestamp window used because the connector does not expose cursor/delta sync'
          }
        });
      }

      return await this.ingestionRunsRepository.finishRun(run.runId, {
        status: 'completed',
        messagesSeen: counters.messagesSeen,
        messagesProcessed: counters.messagesProcessed,
        messagesInserted: counters.messagesInserted,
        messagesUpdated: counters.messagesUpdated,
        attachmentsSeen: counters.attachmentsSeen,
        jobsPublished: counters.jobsPublished,
        metadata: {
          capabilities: this.mailProvider.getCapabilities(),
          note: 'Connector currently exposes mailbox listing only; folder-specific sync, message detail fetch, attachment listing, and cursor/delta sync are unavailable.'
        }
      });
    } catch (error) {
      logger.error({ err: error, runId: run.runId }, 'Mail ingestion run failed');

      return await this.ingestionRunsRepository.finishRun(run.runId, {
        status: 'failed',
        messagesSeen: counters.messagesSeen,
        messagesProcessed: counters.messagesProcessed,
        messagesInserted: counters.messagesInserted,
        messagesUpdated: counters.messagesUpdated,
        attachmentsSeen: counters.attachmentsSeen,
        jobsPublished: counters.jobsPublished,
        error: error instanceof Error ? error.message : 'Unknown ingestion error',
        metadata: {
          capabilities: this.mailProvider.getCapabilities()
        }
      });
    }
  }

  async getStatus(): Promise<IngestionStatus> {
    try {
      const connectionName = await this.mailProvider.resolveConnectionName(
        env.OPENCLAW_MSGRAPH_CONNECTION_NAME
      );

      return {
        provider: MAIL_PROVIDER_NAME,
        connectionName,
        configuredFolders: env.MAIL_INGESTION_FOLDERS,
        capabilities: this.mailProvider.getCapabilities(),
        recentRuns: await this.ingestionRunsRepository.listRecent(env.MAIL_INGESTION_STATUS_LIMIT),
        syncState: await this.syncStateRepository.listByProvider(MAIL_PROVIDER_NAME, connectionName),
        queueActionType: CLASSIFY_EMAIL_ACTION,
        connector: {
          reachable: true
        }
      };
    } catch (error) {
      logger.warn({ err: error }, 'Unable to resolve Microsoft connector status');

      return {
        provider: MAIL_PROVIDER_NAME,
        ...(env.OPENCLAW_MSGRAPH_CONNECTION_NAME
          ? { connectionName: env.OPENCLAW_MSGRAPH_CONNECTION_NAME }
          : {}),
        configuredFolders: env.MAIL_INGESTION_FOLDERS,
        capabilities: this.mailProvider.getCapabilities(),
        recentRuns: await this.ingestionRunsRepository.listRecent(env.MAIL_INGESTION_STATUS_LIMIT),
        syncState: await this.syncStateRepository.listByProvider(MAIL_PROVIDER_NAME),
        queueActionType: CLASSIFY_EMAIL_ACTION,
        connector: {
          reachable: false,
          error: error instanceof Error ? error.message : 'Unknown connector resolution error'
        }
      };
    }
  }

  async listRecentRuns(limit: number): Promise<IngestionRunSummary[]> {
    return this.ingestionRunsRepository.listRecent(limit);
  }
}
