import type { AttachmentMeta, MailboxId } from '@relay/shared/domain';
import type { InviteCandidate, InviteCandidateRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { placedIn } from './memory-placements';

const CALENDAR_TYPES = new Set(['text/calendar', 'application/ics', 'application/x-ics']);

const isCalendar = (attachment: AttachmentMeta): boolean =>
  CALENDAR_TYPES.has(attachment.contentType.toLowerCase()) ||
  /\.ics$/i.test(attachment.filename ?? '');

export class MemoryInviteCandidateRepository implements InviteCandidateRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listAfter(mailboxId: MailboxId, afterUid: number, limit: number): Promise<InviteCandidate[]> {
    const candidates = [...this.db.tables.messages.values()]
      .filter((message) => message.attachments.some(isCalendar))
      .flatMap((message) =>
        placedIn(message, mailboxId)
          .filter((placement) => placement.uid > afterUid)
          .map((placement) => ({
            messageId: message.id,
            threadId: message.threadId,
            uid: placement.uid,
            date: message.date,
          })),
      )
      .sort((a, b) => a.uid - b.uid)
      .slice(0, limit);
    return Promise.resolve(candidates);
  }
}
