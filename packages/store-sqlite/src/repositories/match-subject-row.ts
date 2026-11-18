import type { StoredMatchSubject } from '@relay/engine';
import { hasFileAttachments } from '@relay/engine';
import {
  AddressSchema,
  AttachmentMetaSchema,
  MessageIdSchema,
  ThreadIdSchema,
} from '@relay/shared/domain';
import { z } from 'zod';
import { toMessageHeaders } from '../mappers/message-mapper';
import { messages } from '../schema';

const RecipientsSchema = z.array(AddressSchema);
const AttachmentsSchema = z.array(AttachmentMetaSchema);

export const matchSubjectColumns = {
  seq: messages.seq,
  id: messages.id,
  threadId: messages.threadId,
  fromName: messages.fromName,
  fromEmail: messages.fromEmail,
  subject: messages.subject,
  headers: messages.headers,
  to: messages.to,
  cc: messages.cc,
  attachments: messages.attachments,
};

export interface MatchSubjectRow {
  readonly id: string;
  readonly threadId: string;
  readonly fromName: string | null;
  readonly fromEmail: string | null;
  readonly subject: string;
  readonly headers: unknown;
  readonly to: unknown;
  readonly cc: unknown;
  readonly attachments: unknown;
}

export const toStoredMatchSubject = (row: MatchSubjectRow): StoredMatchSubject => ({
  messageId: MessageIdSchema.parse(row.id),
  threadId: ThreadIdSchema.parse(row.threadId),
  subject: {
    from: row.fromEmail === null ? null : { name: row.fromName, email: row.fromEmail },
    subject: row.subject,
    headers: toMessageHeaders(row.headers),
    to: RecipientsSchema.parse(row.to),
    cc: RecipientsSchema.parse(row.cc),
    hasAttachments: hasFileAttachments(AttachmentsSchema.parse(row.attachments)),
  },
});
