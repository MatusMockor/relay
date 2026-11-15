import type { MailAccount, ThreadId, UserId } from '@relay/shared/domain';
import type { SentMessage } from '../../model/outgoing-message';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { SplitRepository } from '../../ports/split-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage, type MailProviderSessions } from '../shared/mail-provider-sessions';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';
import { publishThreadOutcomes, refreshThread } from '../shared/thread-refresh';
import type { MessageIngestor } from '../sync/message-ingestor';

export interface SentMessageRecorderDeps {
  readonly roleMailboxes: RoleMailboxEnsurer;
  readonly splits: SplitRepository;
  readonly sessions: MailProviderSessions;
  readonly ingestor: MessageIngestor;
  readonly unitOfWork: UnitOfWork;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class SentMessageRecorder {
  constructor(private readonly deps: SentMessageRecorderDeps) {}

  async record(userId: UserId, account: MailAccount, sent: SentMessage): Promise<ThreadId | null> {
    if (account.provider === 'gmail') {
      return null;
    }
    try {
      const stored = await this.deps.sessions.with(account, async (provider) => {
        const mailbox = await this.deps.roleMailboxes.ensure(account, 'sent', provider);
        if (mailbox === null) {
          return null;
        }
        return { mailbox, appended: await provider.append(mailbox.path, sent.raw, { seen: true }) };
      });
      const uid = stored?.appended.uid ?? null;
      if (stored === null || uid === null) {
        return null;
      }
      const sentBox = stored.mailbox;
      const outcome = await this.deps.ingestor.ingest(
        {
          userId,
          account,
          mailbox: sentBox,
          splits: await this.deps.splits.listForAccount(userId, account.id),
        },
        {
          mailboxPath: sentBox.path,
          uid,
          flags: { seen: true, flagged: false, answered: false },
          keywords: [],
          internalDate: this.deps.clock.now().toISOString(),
          size: sent.raw.byteLength,
          modseq: null,
          source: sent.raw,
        },
      );
      if (outcome.kind === 'skipped') {
        return null;
      }
      const threadId = outcome.message.threadId;
      const refreshed = await this.deps.unitOfWork.run((repositories) =>
        refreshThread(repositories, userId, account.id, threadId, {
          resolveState: (existing) => existing?.state ?? 'done',
        }),
      );
      await publishThreadOutcomes(this.deps.events, userId, [refreshed]);
      await this.deps.events.emit(userId, 'message.upserted', { message: outcome.message });
      return threadId;
    } catch (error) {
      this.deps.logger.warn('Saving a sent message to the Sent mailbox failed', {
        accountId: account.id,
        error: errorMessage(error),
      });
      return null;
    }
  }
}
