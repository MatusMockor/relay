import type { Mailbox } from '@relay/shared/domain';
import type { PendingWork } from '../../../model/pending-work';
import type { Logger } from '../../../ports/logger';
import type {
  BodyRepairCandidate,
  MessageBodyRepairRepository,
} from '../../../ports/message-body-repair-repository';
import type { Repositories } from '../../../ports/repositories';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import type { EngineEvents } from '../../shared/engine-events';
import { errorMessage } from '../../shared/mail-provider-sessions';
import type { SyncBackfill } from '../sync-backfill';
import type { SyncContext } from '../sync-context';
import type { BodyRefetcher, RefetchOutcome } from './body-refetcher';

export const DEFAULT_BODY_REPAIR_BATCH = 50;

export interface MessageBodyRepairDeps {
  readonly bodies: MessageBodyRepairRepository;
  readonly repositories: Pick<Repositories, 'messages' | 'pendingWork' | 'syncStates'>;
  readonly unitOfWork: UnitOfWork;
  readonly refetcher: BodyRefetcher;
  readonly events: EngineEvents;
  readonly logger: Logger;
  readonly batchSize: number;
}

type RepairWork = PendingWork<'body-repair'>;

export class MessageBodyRepair implements SyncBackfill {
  constructor(private readonly deps: MessageBodyRepairDeps) {}

  async run(context: SyncContext, mailboxes: readonly Mailbox[]): Promise<void> {
    const { pendingWork } = this.deps.repositories;
    let budget = this.deps.batchSize;
    try {
      for (const work of await pendingWork.list(context.account.id, 'body-repair')) {
        if (budget <= 0) {
          return;
        }
        const mailbox = mailboxes.find((entry) => entry.id === work.payload.mailboxId);
        if (mailbox === undefined) {
          await pendingWork.remove([work]);
          continue;
        }
        budget -= await this.mailbox(context, mailbox, work, budget);
      }
    } catch (error) {
      this.deps.logger.warn('Message body repair paused', {
        accountId: context.account.id,
        error: errorMessage(error),
      });
    }
  }

  private async mailbox(
    context: SyncContext,
    mailbox: Mailbox,
    work: RepairWork,
    budget: number,
  ): Promise<number> {
    const candidates = await this.deps.bodies.listAfter(mailbox.id, work.payload.afterUid, budget);
    if (candidates.length > 0 && !(await this.sameUidValidity(context, mailbox))) {
      this.deps.logger.info('Message body repair skipped a mailbox with a new UIDVALIDITY', {
        accountId: context.account.id,
        mailboxId: mailbox.id,
      });
      await this.deps.repositories.pendingWork.remove([work]);
      return 0;
    }
    let cursor = work;
    for (const candidate of candidates) {
      const outcome = await this.deps.refetcher.refetch(context.provider, mailbox, candidate);
      cursor = await this.apply(context, cursor, candidate, outcome);
      if (outcome.kind === 'failed') {
        this.deps.logger.warn('Message body repair skipped a message', {
          accountId: context.account.id,
          messageId: candidate.messageId,
          error: errorMessage(outcome.error),
        });
        return budget;
      }
    }
    if (candidates.length < budget) {
      await this.deps.repositories.pendingWork.remove([cursor]);
    }
    return candidates.length;
  }

  private async apply(
    context: SyncContext,
    cursor: RepairWork,
    candidate: BodyRepairCandidate,
    outcome: RefetchOutcome,
  ): Promise<RepairWork> {
    if (outcome.kind === 'repaired') {
      await this.deps.unitOfWork.run((repositories) =>
        context.journal.touched(repositories.pendingWork, candidate.threadId),
      );
      await this.deps.bodies.updateBody(candidate.messageId, outcome.body);
    }
    const next = await this.deps.unitOfWork.run((repositories) => {
      const { revision: _revision, ...key } = cursor;
      return repositories.pendingWork.put({
        ...key,
        payload: { mailboxId: cursor.payload.mailboxId, afterUid: candidate.uid },
      });
    });
    await this.publish(context, candidate, outcome);
    return next;
  }

  private async sameUidValidity(context: SyncContext, mailbox: Mailbox): Promise<boolean> {
    const state = await this.deps.repositories.syncStates.find(mailbox.id);
    if (state === null) {
      return false;
    }
    const status = await context.provider.status(mailbox.path);
    return status.uidValidity === state.uidValidity;
  }

  private async publish(
    context: SyncContext,
    candidate: BodyRepairCandidate,
    outcome: RefetchOutcome,
  ): Promise<void> {
    if (outcome.kind !== 'repaired') {
      return;
    }
    const message = await this.deps.repositories.messages.findById(
      context.userId,
      candidate.messageId,
    );
    if (message === null) {
      return;
    }
    await this.deps.events.emit(context.userId, 'message.upserted', { message });
  }
}
