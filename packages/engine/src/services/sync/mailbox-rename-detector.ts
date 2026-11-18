import type { Mailbox, MailboxId } from '@relay/shared/domain';
import type { RemoteMailbox } from '../../model/remote-mail';
import type { MailboxStatuses } from './mailbox-status-probe';

export interface MailboxRename {
  readonly mailbox: Mailbox;
  readonly target: RemoteMailbox;
}

export interface RenameInput {
  readonly gone: readonly Mailbox[];
  readonly appeared: readonly RemoteMailbox[];
  readonly statuses: MailboxStatuses;
  readonly syncedValidity: ReadonlyMap<MailboxId, number>;
}

const knownValidity = (mailbox: Mailbox, synced: ReadonlyMap<MailboxId, number>): number | null =>
  synced.get(mailbox.id) ?? mailbox.uidValidity;

const candidatesOf = (mailbox: Mailbox, input: RenameInput): RemoteMailbox[] => {
  const uidValidity = knownValidity(mailbox, input.syncedValidity);
  if (uidValidity === null) {
    return [];
  }
  return input.appeared.filter((remote) => {
    const status = input.statuses.get(remote.path);
    return status?.uidValidity === uidValidity && status.messages === mailbox.totalCount;
  });
};

export const detectRenames = (input: RenameInput): MailboxRename[] => {
  const matches = input.gone.map((mailbox) => ({
    mailbox,
    candidates: candidatesOf(mailbox, input),
  }));
  const claims = new Map<string, number>();
  for (const remote of matches.flatMap(({ candidates }) => candidates)) {
    claims.set(remote.path, (claims.get(remote.path) ?? 0) + 1);
  }
  return matches.flatMap(({ mailbox, candidates }) => {
    const [target] = candidates;
    if (candidates.length !== 1 || target === undefined || claims.get(target.path) !== 1) {
      return [];
    }
    return [{ mailbox, target }];
  });
};
