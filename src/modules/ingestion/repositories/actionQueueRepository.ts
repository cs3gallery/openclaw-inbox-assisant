import type { PoolClient } from 'pg';

type EnqueueActionResult = {
  actionQueueId: string;
};

export class ActionQueueRepository {
  async enqueueClassifyEmail(
    client: PoolClient,
    payload: Record<string, unknown>,
    emailId: string
  ): Promise<EnqueueActionResult | null> {
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO action_queue (
          action_type,
          target_type,
          target_id,
          email_id,
          status,
          payload,
          result
        )
        VALUES ('classify_email', 'email', $1, $1, 'pending', $2::jsonb, '{}'::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING id
      `,
      [emailId, JSON.stringify(payload)]
    );

    return result.rows[0] ? { actionQueueId: result.rows[0].id } : null;
  }
}

