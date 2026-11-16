import type { Mailbox } from '@relay/shared/domain';
import type { CalendarRebuildWork, PendingWork } from '../../../model/pending-work';
import type { Clock } from '../../../ports/clock';
import type { Repositories } from '../../../ports/repositories';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import type { SyncContext } from '../../sync/sync-context';
import { acceptsInvites } from '../invite-queue';

type RebuildCursor = PendingWork<'calendar-rebuild'>;

export interface RebuildCollectorDeps {
  readonly repositories: Pick<Repositories, 'inviteCandidates' | 'pendingWork' | 'syncStates'>;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly batchSize: number;
}

export class RebuildCollector {
  constructor(private readonly deps: RebuildCollectorDeps) {}

  async collect(
    context: SyncContext,
    mailboxes: readonly Mailbox[],
    cursors: readonly RebuildCursor[],
  ): Promise<boolean> {
    const all = [...cursors, ...(await this.enroll(context, mailboxes, cursors))];
    let budget = this.deps.batchSize;
    let exhausted = true;
    for (const cursor of all) {
      const mailbox = mailboxes.find((entry) => entry.id === cursor.payload.mailboxId);
      if (mailbox === undefined || !acceptsInvites(mailbox.role)) {
        await this.deps.repositories.pendingWork.remove([cursor]);
        continue;
      }
      if (budget <= 0) {
        return false;
      }
      const fetched = await this.mailbox(context, mailbox, await this.validated(cursor), budget);
      exhausted = exhausted && fetched < budget;
      budget -= fetched;
    }
    return exhausted;
  }

  private async enroll(
    context: SyncContext,
    mailboxes: readonly Mailbox[],
    cursors: readonly RebuildCursor[],
  ): Promise<RebuildCursor[]> {
    const known = new Set(cursors.map((cursor) => cursor.payload.mailboxId));
    const failedReplays = Math.max(
      0,
      ...cursors.map((cursor) => cursor.payload.failedReplays ?? 0),
    );
    const missing = mailboxes.filter(
      (mailbox) => acceptsInvites(mailbox.role) && !known.has(mailbox.id),
    );
    return Promise.all(
      missing.map((mailbox) =>
        this.deps.repositories.pendingWork.put({
          accountId: context.account.id,
          kind: 'calendar-rebuild',
          ref: mailbox.id,
          payload: { mailboxId: mailbox.id, afterUid: 0, failedReplays },
          createdAt: this.deps.clock.now().toISOString(),
        }),
      ),
    );
  }

  private async validated(cursor: RebuildCursor): Promise<RebuildCursor> {
    const state = await this.deps.repositories.syncStates.find(cursor.payload.mailboxId);
    const uidValidity = state?.uidValidity ?? null;
    const recorded = cursor.payload.uidValidity;
    if (recorded === uidValidity) {
      return cursor;
    }
    const afterUid = recorded === undefined ? cursor.payload.afterUid : 0;
    return this.advance(this.deps.repositories, cursor, {
      ...cursor.payload,
      afterUid,
      uidValidity,
    });
  }

  private async mailbox(
    context: SyncContext,
    mailbox: Mailbox,
    cursor: RebuildCursor,
    budget: number,
  ): Promise<number> {
    const candidates = await this.deps.repositories.inviteCandidates.listAfter(
      mailbox.id,
      cursor.payload.afterUid,
      budget,
    );
    let current = cursor;
    for (const candidate of candidates) {
      const parts = (await context.provider.fetchCalendarParts(mailbox.path, candidate.uid)) ?? [];
      current = await this.deps.unitOfWork.run(async (repositories) => {
        if (parts.length > 0) {
          await repositories.pendingWork.put({
            accountId: context.account.id,
            kind: 'calendar-rebuild-part',
            ref: candidate.messageId,
            payload: {
              messageId: candidate.messageId,
              threadId: candidate.threadId,
              mailboxRole: mailbox.role,
              date: candidate.date,
              parts,
            },
            createdAt: candidate.date,
          });
        }
        return this.advance(repositories, current, {
          ...current.payload,
          afterUid: candidate.uid,
        });
      });
    }
    return candidates.length;
  }

  private advance(
    repositories: Pick<Repositories, 'pendingWork'>,
    cursor: RebuildCursor,
    payload: CalendarRebuildWork,
  ): Promise<RebuildCursor> {
    const { revision: _revision, ...key } = cursor;
    return repositories.pendingWork.put({ ...key, payload });
  }
}
