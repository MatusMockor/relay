import type { RawMessage } from '../../model/remote-mail';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { ChangeFlusher } from './change-flusher';
import type { MessageIngestor } from './message-ingestor';
import type { MailboxPass } from './mailbox-synchronizer';
import type { SyncContext } from './sync-context';
import type { SyncOptions } from './sync-options';
import type { SyncReporter } from './sync-reporter';
import { syncWindow } from './sync-window';

export interface NewMessageFetcherDeps {
  readonly ingestor: MessageIngestor;
  readonly flusher: ChangeFlusher;
  readonly syncStates: SyncStateRepository;
  readonly reporter: SyncReporter;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly options: SyncOptions;
}

export class NewMessageFetcher {
  constructor(private readonly deps: NewMessageFetcherDeps) {}

  async fetch(context: SyncContext, pass: MailboxPass): Promise<void> {
    const window = await syncWindow(context, pass, this.deps.options, this.deps.clock);
    const knownModseq = pass.state === null ? pass.status.highestModseq : pass.state.highestModseq;
    let lastUid = window.cursor.lastUid;
    let processed = 0;
    for await (const raw of context.provider.fetchSince(pass.mailbox.path, window.cursor)) {
      lastUid = Math.max(lastUid, raw.uid);
      processed += 1;
      if (window.cutoff === null || Date.parse(raw.internalDate) >= window.cutoff) {
        await this.ingest(context, pass, raw);
      }
      if (processed % this.deps.options.batchSize === 0) {
        await this.checkpoint(context, pass, lastUid, pass.state?.highestModseq ?? null);
        await this.progress(context, pass, processed, window.expected);
      }
    }
    await this.checkpoint(context, pass, lastUid, knownModseq);
    await this.progress(context, pass, processed, Math.max(window.expected, processed));
  }

  private async ingest(context: SyncContext, pass: MailboxPass, raw: RawMessage): Promise<void> {
    const outcome = await this.deps.ingestor.ingest(
      {
        userId: context.userId,
        account: context.account,
        mailbox: pass.mailbox,
        splits: context.splits,
        journal: context.journal,
        publish: pass.state !== null,
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

  private async checkpoint(
    context: SyncContext,
    pass: MailboxPass,
    lastUid: number,
    highestModseq: string | null,
  ): Promise<void> {
    await this.deps.flusher.flush(context);
    await this.deps.syncStates.save({
      accountId: context.account.id,
      mailboxId: pass.mailbox.id,
      uidValidity: pass.status.uidValidity,
      lastUid,
      highestModseq,
      syncedAt: this.deps.clock.now().toISOString(),
    });
  }

  private progress(
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
}
