import type { AttachmentMeta, MailboxId } from '@relay/shared/domain';
import type { InviteCandidate, InviteCandidateRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';

const CALENDAR_TYPES = new Set(['text/calendar', 'application/ics', 'application/x-ics']);

const isCalendar = (attachment: AttachmentMeta): boolean =>
  CALENDAR_TYPES.has(attachment.contentType.toLowerCase()) ||
  /\.ics$/i.test(attachment.filename ?? '');

export class MemoryInviteCandidateRepository implements InviteCandidateRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listAfter(mailboxId: MailboxId, afterUid: number, limit: number): Promise<InviteCandidate[]> {
    const candidates = [...this.db.tables.messages.values()]
      .filter(
        (message) =>
          message.mailboxId === mailboxId &&
          message.uid > afterUid &&
          message.attachments.some(isCalendar),
      )
      .sort((a, b) => a.uid - b.uid)
      .slice(0, limit)
      .map((message) => ({
        messageId: message.id,
        threadId: message.threadId,
        uid: message.uid,
        date: message.date,
      }));
    return Promise.resolve(candidates);
  }
}
