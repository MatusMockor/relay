import type { SyncStage } from '@relay/shared/realtime';
import type { RawMessage, RemoteMessageMeta } from '../../model/remote-mail';
import type { InitialSyncWindow } from '../../model/sync-state';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { ChangeFlusher } from './change-flusher';
import type { MessageIngestor } from './message-ingestor';
import type { MailboxPass } from './mailbox-synchronizer';
import type { SyncContext } from './sync-context';
import type { SyncReporter } from './sync-reporter';

export interface MessageFetchStepsDeps {
  readonly ingestor: MessageIngestor;
  readonly flusher: ChangeFlusher;
  readonly syncStates: SyncStateRepository;
  readonly reporter: SyncReporter;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface IngestMode {
  readonly publish: boolean;
  readonly live: boolean;
  readonly holdCalendar: boolean;
}

export interface SyncMark {
  readonly lastUid: number;
  readonly highestModseq: string | null;
  readonly initialWindow: InitialSyncWindow | null;
}

export class MessageFetchSteps {
  constructor(private readonly deps: MessageFetchStepsDeps) {}

  async ingest(
    context: SyncContext,
    pass: MailboxPass,
    raw: RawMessage,
    mode: IngestMode,
  ): Promise<void> {
    const outcome = await this.deps.ingestor.ingest(
      {
        userId: context.userId,
        account: context.account,
        mailbox: pass.mailbox,
        splits: context.splits,
        journal: context.journal,
        publish: mode.publish,
        live: mode.live,
        holdCalendar: mode.holdCalendar,
      },
      raw,
    );
    if (outcome.kind === 'skipped') {
      this.deps.logger.warn('Skipping a message that could not be parsed', {
        accountId: context.account.id,
        mailboxId: pass.mailbox.id,
        uid: raw.uid,
        error: outcome.reason,
      });
      return;
    }
    if (outcome.kind === 'created') {
      context.stats.newMessages += 1;
    }
  }

  async tryAttachMeta(
    context: SyncContext,
    pass: MailboxPass,
    meta: RemoteMessageMeta,
    mode: IngestMode,
  ): Promise<boolean> {
    const outcome = await this.deps.ingestor.tryAttachMeta(
      {
        userId: context.userId,
        account: context.account,
        mailbox: pass.mailbox,
        splits: context.splits,
        journal: context.journal,
        publish: mode.publish,
        live: mode.live,
        holdCalendar: mode.holdCalendar,
      },
      meta,
    );
    return outcome !== null;
  }

  flush(context: SyncContext): Promise<void> {
    return this.deps.flusher.flush(context);
  }

  save(context: SyncContext, pass: MailboxPass, mark: SyncMark): Promise<void> {
    return this.deps.syncStates.save({
      accountId: context.account.id,
      mailboxId: pass.mailbox.id,
      uidValidity: pass.status.uidValidity,
      uidNext: null,
      messageCount: null,
      ...mark,
      syncedAt: this.deps.clock.now().toISOString(),
    });
  }

  async checkpoint(context: SyncContext, pass: MailboxPass, mark: SyncMark): Promise<void> {
    await this.flush(context);
    await this.save(context, pass, mark);
  }

  progress(
    context: SyncContext,
    pass: MailboxPass,
    processed: number,
    total: number,
  ): Promise<void> {
    return this.deps.reporter.progress(context.userId, context.account.id, {
      mailboxId: pass.mailbox.id,
      phase: 'messages',
      processed,
      total,
    });
  }

  stage(context: SyncContext, stage: SyncStage, processed: number, total: number): Promise<void> {
    return this.deps.reporter.progress(context.userId, context.account.id, {
      mailboxId: null,
      phase: 'messages',
      processed: Math.min(processed, total),
      total,
      stage,
    });
  }
}
