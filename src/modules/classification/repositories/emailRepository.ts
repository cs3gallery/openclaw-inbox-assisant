import { postgresPool } from '../../../db/postgres/client';
import type { ClassifierEmailContext, ClassificationRecipient } from '../types';

type EmailRow = {
  id: string;
  graph_message_id: string | null;
  internet_message_id: string | null;
  conversation_id: string | null;
  subject: string;
  from_email: string;
  from_name: string | null;
  body_text: string | null;
  body_html: string | null;
  body_preview: string | null;
  received_at: Date | null;
  sent_at: Date | null;
  source_folder: string;
  importance: string | null;
  metadata: Record<string, unknown> | null;
  sender_importance_score: string | number | null;
  sender_relationship_notes: string | null;
};

type RecipientRow = {
  recipient_type: string;
  email_address: string;
  display_name: string | null;
};

function toNumber(value: string | number | null): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function mapRecipient(row: RecipientRow): ClassificationRecipient {
  return {
    recipientType: row.recipient_type,
    emailAddress: row.email_address,
    ...(row.display_name ? { displayName: row.display_name } : {})
  };
}

export class ClassificationEmailRepository {
  async getEmailContext(emailId: string): Promise<ClassifierEmailContext | null> {
    const emailResult = await postgresPool.query<EmailRow>(
      `
        SELECT
          emails.id,
          emails.graph_message_id,
          emails.internet_message_id,
          emails.conversation_id,
          emails.subject,
          emails.from_email,
          emails.from_name,
          emails.body_text,
          emails.body_html,
          emails.body_preview,
          emails.received_at,
          emails.sent_at,
          emails.source_folder,
          emails.importance,
          emails.metadata,
          sender_profiles.importance_score AS sender_importance_score,
          sender_profiles.relationship_notes AS sender_relationship_notes
        FROM emails
        LEFT JOIN sender_profiles
          ON sender_profiles.id = emails.sender_profile_id
        WHERE emails.id = $1
        LIMIT 1
      `,
      [emailId]
    );

    const email = emailResult.rows[0];

    if (!email) {
      return null;
    }

    const recipientsResult = await postgresPool.query<RecipientRow>(
      `
        SELECT recipient_type, email_address, display_name
        FROM email_recipients
        WHERE email_id = $1
        ORDER BY
          CASE recipient_type
            WHEN 'to' THEN 0
            WHEN 'cc' THEN 1
            WHEN 'bcc' THEN 2
            WHEN 'reply_to' THEN 3
            ELSE 4
          END ASC,
          position ASC
      `,
      [emailId]
    );

    return {
      emailId: email.id,
      ...(email.graph_message_id ? { graphMessageId: email.graph_message_id } : {}),
      ...(email.internet_message_id ? { internetMessageId: email.internet_message_id } : {}),
      ...(email.conversation_id ? { conversationId: email.conversation_id } : {}),
      subject: email.subject,
      fromEmail: email.from_email,
      ...(email.from_name ? { fromName: email.from_name } : {}),
      ...(email.body_text ? { bodyText: email.body_text } : {}),
      ...(email.body_html ? { bodyHtml: email.body_html } : {}),
      ...(email.body_preview ? { bodyPreview: email.body_preview } : {}),
      ...(email.received_at ? { receivedAt: email.received_at.toISOString() } : {}),
      ...(email.sent_at ? { sentAt: email.sent_at.toISOString() } : {}),
      sourceFolder: email.source_folder,
      ...(email.importance ? { importance: email.importance } : {}),
      metadata: email.metadata ?? {},
      ...(toNumber(email.sender_importance_score) !== undefined
        ? { senderImportanceScore: toNumber(email.sender_importance_score) }
        : {}),
      ...(email.sender_relationship_notes
        ? { senderRelationshipNotes: email.sender_relationship_notes }
        : {}),
      recipients: recipientsResult.rows.map(mapRecipient)
    };
  }
}
