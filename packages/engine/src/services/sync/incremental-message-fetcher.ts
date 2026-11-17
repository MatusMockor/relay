import type { MailboxSyncState } from '../../model/sync-state';
import type { MailboxPass } from './mailbox-synchronizer';
import type { MessageFetchSteps } from './message-fetch-steps';
import type { SyncContext } from './sync-context';
import type { SyncOptions } from './sync-options';

export interface IncrementalMessageFetcherDeps {
  readonly steps: MessageFetchSteps;
  readonly options: SyncOptions;
}

export class IncrementalMessageFetcher {
  constructor(private readonly deps: IncrementalMessageFetcherDeps) {}

  async fetch(
    context: SyncContext,
    pass: MailboxPass,
    state: MailboxSyncState,
    holdCalendar: boolean,
  ): Promise<void> {
    const { steps, options } = this.deps;
    const cursor = {
      uidValidity: state.uidValidity,
      lastUid: state.lastUid,
      highestModseq: state.highestModseq,
    };
    const expected = Math.max(0, pass.status.uidNext - 1 - state.lastUid);
    const mark = { highestModseq: state.highestModseq, initialWindow: null };
    let lastUid = state.lastUid;
    let processed = 0;
    for await (const raw of context.provider.fetchSince(pass.mailbox.path, cursor)) {
      lastUid = Math.max(lastUid, raw.uid);
      processed += 1;
      await steps.ingest(context, pass, raw, { publish: true, live: true, holdCalendar });
      if (processed % options.batchSize === 0) {
        await steps.checkpoint(context, pass, { ...mark, lastUid });
        await steps.progress(context, pass, processed, expected);
      }
    }
    await steps.checkpoint(context, pass, { ...mark, lastUid });
    await steps.progress(context, pass, processed, Math.max(expected, processed));
  }
}
