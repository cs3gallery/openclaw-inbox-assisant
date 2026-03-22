import type { PoolClient } from 'pg';

import { postgresPool } from '../../../db/postgres/client';
import { logger } from '../../../common/logger';
import { flattenRecipients } from '../normalize';
import type { CanonicalEmail } from '../types';

type PersistEmailResult = {
  emailId: string;
  inserted: boolean;
  attachmentsSeen: number;
};

type ExistingEmailRow = {
  id: string;
};

type SenderProfileRow = {
  id: string;
};

type PersistEmailCounts = {
  attachmentsSeen: number;
};

function serializeRecipients(recipients: CanonicalEmail['toRecipients']): string {
  return JSON.stringify(recipients);
}

async function upsertSenderProfile(client: PoolClient, email: CanonicalEmail): Promise<string> {
  const result = await client.query<SenderProfileRow>(
    `
      INSERT INTO sender_profiles (
        email_address,
        display_name,
        last_seen_at,
        profile_data
      )
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (email_address)
      DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, sender_profiles.display_name),
        last_seen_at = GREATEST(COALESCE(sender_profiles.last_seen_at, EXCLUDED.last_seen_at), EXCLUDED.last_seen_at),
        profile_data = sender_profiles.profile_data || EXCLUDED.profile_data
      RETURNING id
    `,
    [
      email.fromEmail,
      email.fromName ?? null,
      email.receivedAt ?? email.sentAt ?? new Date().toISOString(),
      JSON.stringify({
        sourceProvider: email.sourceProvider,
        sourceConnectionName: email.sourceConnectionName
      })
    ]
  );

  return result.rows[0].id;
}

async function findExistingEmail(client: PoolClient, email: CanonicalEmail): Promise<string | null> {
  const result = await client.query<ExistingEmailRow>(
    `
      SELECT id
      FROM emails
      WHERE graph_message_id = $1
         OR ($2::text IS NOT NULL AND internet_message_id = $2)
      ORDER BY CASE WHEN graph_message_id = $1 THEN 0 ELSE 1 END ASC
      LIMIT 1
    `,
    [email.graphMessageId, email.internetMessageId ?? null]
  );

  return result.rows[0]?.id ?? null;
}

async function replaceRecipients(client: PoolClient, emailId: string, email: CanonicalEmail): Promise<void> {
  await client.query('DELETE FROM email_recipients WHERE email_id = $1', [emailId]);

  const recipients = flattenRecipients(email);

  for (const recipient of recipients) {
    await client.query(
      `
        INSERT INTO email_recipients (
          email_id,
          recipient_type,
          email_address,
          display_name,
          position,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        emailId,
        recipient.recipientType,
        recipient.emailAddress,
        recipient.displayName ?? null,
        recipient.position,
        JSON.stringify({
          sourceProvider: email.sourceProvider
        })
      ]
    );
  }
}

async function replaceAttachments(client: PoolClient, emailId: string, email: CanonicalEmail): Promise<number> {
  await client.query('DELETE FROM attachments WHERE email_id = $1', [emailId]);

  for (const attachment of email.attachments) {
    await client.query(
      `
        INSERT INTO attachments (
          email_id,
          graph_attachment_id,
          file_name,
          content_type,
          size_bytes,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        emailId,
        attachment.graphAttachmentId ?? null,
        attachment.fileName,
        attachment.contentType ?? null,
        attachment.sizeBytes ?? null,
        JSON.stringify(attachment.metadata)
      ]
    );
  }

  return email.attachments.length;
}

async function writeEmailRecord(
  client: PoolClient,
  emailId: string | null,
  senderProfileId: string,
  email: CanonicalEmail
): Promise<{ emailId: string; inserted: boolean }> {
  if (!emailId) {
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO emails (
          sender_profile_id,
          graph_message_id,
          internet_message_id,
          conversation_id,
          subject,
          from_email,
          from_name,
          to_recipients,
          cc_recipients,
          bcc_recipients,
          reply_to_recipients,
          received_at,
          sent_at,
          body_preview,
          body_text,
          body_html,
          body_content_type,
          is_read,
          has_attachments,
          source_updated_at,
          source_last_modified_at,
          source_provider,
          source_connection_name,
          source_folder,
          importance,
          raw_headers,
          metadata,
          raw_payload,
          last_ingested_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
          $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, '{}'::jsonb, $26::jsonb, $27::jsonb, NOW()
        )
        RETURNING id
      `,
      [
        senderProfileId,
        email.graphMessageId,
        email.internetMessageId ?? null,
        email.conversationId ?? null,
        email.subject,
        email.fromEmail,
        email.fromName ?? null,
        serializeRecipients(email.toRecipients),
        serializeRecipients(email.ccRecipients),
        serializeRecipients(email.bccRecipients),
        serializeRecipients(email.replyToRecipients),
        email.receivedAt ?? new Date().toISOString(),
        email.sentAt ?? null,
        email.bodyPreview ?? null,
        email.bodyText ?? null,
        email.bodyHtml ?? null,
        email.bodyContentType ?? null,
        email.isRead,
        email.hasAttachments,
        email.sourceLastModifiedAt ?? null,
        email.sourceLastModifiedAt ?? null,
        email.sourceProvider,
        email.sourceConnectionName,
        email.sourceFolder,
        email.importance ?? null,
        JSON.stringify(email.metadata),
        JSON.stringify(email.rawPayload ?? {})
      ]
    );

    return {
      emailId: result.rows[0].id,
      inserted: true
    };
  }

  await client.query(
    `
      UPDATE emails
      SET
        sender_profile_id = $2,
        internet_message_id = $3,
        conversation_id = $4,
        subject = $5,
        from_email = $6,
        from_name = $7,
        to_recipients = $8::jsonb,
        cc_recipients = $9::jsonb,
        bcc_recipients = $10::jsonb,
        reply_to_recipients = $11::jsonb,
        received_at = $12,
        sent_at = $13,
        body_preview = $14,
        body_text = $15,
        body_html = $16,
        body_content_type = $17,
        is_read = $18,
        has_attachments = $19,
        source_updated_at = $20,
        source_last_modified_at = $21,
        source_provider = $22,
        source_connection_name = $23,
        source_folder = $24,
        importance = $25,
        metadata = $26::jsonb,
        raw_payload = $27::jsonb,
        last_ingested_at = NOW()
      WHERE id = $1
    `,
    [
      emailId,
      senderProfileId,
      email.internetMessageId ?? null,
      email.conversationId ?? null,
      email.subject,
      email.fromEmail,
      email.fromName ?? null,
      serializeRecipients(email.toRecipients),
      serializeRecipients(email.ccRecipients),
      serializeRecipients(email.bccRecipients),
      serializeRecipients(email.replyToRecipients),
      email.receivedAt ?? new Date().toISOString(),
      email.sentAt ?? null,
      email.bodyPreview ?? null,
      email.bodyText ?? null,
      email.bodyHtml ?? null,
      email.bodyContentType ?? null,
      email.isRead,
      email.hasAttachments,
      email.sourceLastModifiedAt ?? null,
      email.sourceLastModifiedAt ?? null,
      email.sourceProvider,
      email.sourceConnectionName,
      email.sourceFolder,
      email.importance ?? null,
      JSON.stringify(email.metadata),
      JSON.stringify(email.rawPayload ?? {})
    ]
  );

  return {
    emailId,
    inserted: false
  };
}

export class MailIngestionRepository {
  async persistEmail(email: CanonicalEmail): Promise<PersistEmailResult> {
    const client = await postgresPool.connect();

    try {
      await client.query('BEGIN');
      const senderProfileId = await upsertSenderProfile(client, email);
      const existingEmailId = await findExistingEmail(client, email);
      const persisted = await writeEmailRecord(client, existingEmailId, senderProfileId, email);

      await replaceRecipients(client, persisted.emailId, email);
      const attachmentsSeen = await replaceAttachments(client, persisted.emailId, email);

      await client.query('COMMIT');

      return {
        emailId: persisted.emailId,
        inserted: persisted.inserted,
        attachmentsSeen
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, graphMessageId: email.graphMessageId }, 'Failed to persist ingested email');
      throw error;
    } finally {
      client.release();
    }
  }
}

