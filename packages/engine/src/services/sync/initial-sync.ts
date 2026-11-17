import type { MailboxId } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import type { CalendarPartsSink } from './calendar-parts-sink';
import { conversationOrder } from './conversation-order';
import { entryKey, fetchChunk } from './initial-chunk';
import { InitialProgress } from './initial-progress';
import { type InitialWindowDeps, type MailboxWindow, mailboxWindow } from './initial-window';
import type { MailboxPass } from './mailbox-synchronizer';
import type { MessageFetchSteps, SyncMark } from './message-fetch-steps';
import type { SyncContext } from './sync-context';
import { skipOnUidValidityChange } from './uid-validity-guard';

export interface InitialSyncDeps extends InitialWindowDeps {
  readonly steps: MessageFetchSteps;
  readonly calendarParts: CalendarPartsSink;
  readonly logger: Logger;
}

const chunked = <Item>(items: readonly Item[], size: number): Item[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const mark = (window: MailboxWindow, initialSyncPending: boolean): SyncMark => {
  const { state, status } = window.pass;
  return {
    lastUid: window.topUid,
    highestModseq: state === null ? status.highestModseq : state.highestModseq,
    initialSyncPending,
  };
};

export class InitialSync {
  constructor(private readonly deps: InitialSyncDeps) {}

  async run(context: SyncContext, passes: readonly MailboxPass[]): Promise<void> {
    const { steps, calendarParts } = this.deps;
    const order = passes.map((pass) => pass.mailbox.id);
    if (passes.length === 0) {
      await calendarParts.release(context.userId, context.account, order);
      return;
    }
    const windows = await this.windows(context, passes);
    for (const window of windows) {
      await steps.save(context, window.pass, mark(window, true));
    }
    const progress = new InitialProgress(windows);
    const failed = await this.ingest(context, windows, progress);
    await calendarParts.release(context.userId, context.account, order);
    await steps.flush(context);
    for (const { window, processed } of progress.all()) {
      if (failed.has(window.pass.mailbox.id)) {
        continue;
      }
      await steps.save(context, window.pass, mark(window, false));
      await steps.progress(context, window.pass, processed, Math.max(window.total, processed));
    }
  }

  private async windows(
    context: SyncContext,
    passes: readonly MailboxPass[],
  ): Promise<MailboxWindow[]> {
    const windows: MailboxWindow[] = [];
    for (const pass of passes) {
      const window = await skipOnUidValidityChange(this.deps.logger, context, pass.mailbox, () =>
        mailboxWindow(context, pass, this.deps),
      );
      if (window !== null) {
        windows.push(window);
      }
    }
    return windows;
  }

  private async ingest(
    context: SyncContext,
    windows: readonly MailboxWindow[],
    progress: InitialProgress,
  ): Promise<Set<MailboxId>> {
    const { steps, options, logger } = this.deps;
    const failed = new Set<MailboxId>();
    const wanted = conversationOrder(windows).filter((entry) => entry.wanted);
    for (const chunk of chunked(wanted, options.batchSize)) {
      const fetched = await fetchChunk(context, logger, chunk, failed);
      for (const entry of chunk) {
        const mailboxId = entry.pass.mailbox.id;
        const raw = fetched.get(entryKey(mailboxId, entry.uid));
        if (raw !== undefined) {
          await steps.ingest(context, entry.pass, raw, true);
        }
        if (!failed.has(mailboxId)) {
          progress.advance(mailboxId);
        }
      }
      await steps.flush(context);
      for (const { window, processed } of progress.takeTouched()) {
        await steps.progress(context, window.pass, processed, window.total);
      }
    }
    return failed;
  }
}
