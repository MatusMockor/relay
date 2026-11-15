import type { RemoteSyncCursor } from '../../model/remote-mail';
import type { Clock } from '../../ports/clock';
import type { MailboxPass } from './mailbox-synchronizer';
import type { SyncContext } from './sync-context';
import type { SyncOptions } from './sync-options';

const DAY_MS = 86_400_000;

export interface SyncWindow {
  readonly cursor: RemoteSyncCursor;
  readonly cutoff: number | null;
  readonly expected: number;
}

export const syncWindow = async (
  context: SyncContext,
  pass: MailboxPass,
  options: SyncOptions,
  clock: Clock,
): Promise<SyncWindow> => {
  if (pass.state !== null) {
    return {
      cursor: {
        uidValidity: pass.state.uidValidity,
        lastUid: pass.state.lastUid,
        highestModseq: pass.state.highestModseq,
      },
      cutoff: null,
      expected: Math.max(0, pass.status.uidNext - 1 - pass.state.lastUid),
    };
  }
  const uids = await context.provider.listUids(pass.mailbox.path);
  const skipped = Math.max(0, uids.length - options.initialMessageLimit);
  return {
    cursor: {
      uidValidity: pass.status.uidValidity,
      lastUid: skipped === 0 ? 0 : (uids[skipped - 1] ?? 0),
      highestModseq: null,
    },
    cutoff: clock.now().getTime() - options.initialWindowDays * DAY_MS,
    expected: uids.length - skipped,
  };
};
