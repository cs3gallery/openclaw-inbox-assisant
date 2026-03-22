import { logger } from '../../common/logger';
import { postgresPool } from '../../db/postgres/client';
import { redisClient } from '../../db/redis/client';
import { CLASSIFY_EMAIL_ACTION } from './constants';
import { ActionQueueRepository } from './repositories/actionQueueRepository';

type QueuePayload = {
  email_id: string;
  graph_message_id?: string;
  source_folder: string;
  received_at?: string;
};

export class MailQueuePublisher {
  constructor(private readonly actionQueueRepository: ActionQueueRepository) {}

  async publishClassifyEmail(payload: QueuePayload): Promise<boolean> {
    const client = await postgresPool.connect();

    try {
      await client.query('BEGIN');
      const inserted = await this.actionQueueRepository.enqueueClassifyEmail(client, payload, payload.email_id);

      if (!inserted) {
        await client.query('ROLLBACK');
        return false;
      }

      await client.query('COMMIT');

      try {
        await redisClient.xadd(
          'openclaw:action_queue',
          '*',
          'action_type',
          CLASSIFY_EMAIL_ACTION,
          'email_id',
          payload.email_id,
          'payload',
          JSON.stringify(payload)
        );
      } catch (error) {
        logger.warn(
          { err: error, payload },
          'Redis queue publish failed after durable action_queue insert'
        );
      }

      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.error({ err: error, payload }, 'Failed to publish classify_email queue entry');
      throw error;
    } finally {
      client.release();
    }
  }
}
