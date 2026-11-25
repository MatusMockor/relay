import type { MailboxId } from '@relay/shared/domain';
import type { RemoteMessageMeta } from '../../model/remote-mail';
import type { Logger } from '../../ports/logger';
import { byMailbox, entryKey } from './initial-chunk';
import type { WindowEntry } from './initial-window';
import type { SyncContext } from './sync-context';
import { skipOnUidValidityChange } from './uid-validity-guard';

const attachable = (entry: WindowEntry, failed: ReadonlySet<MailboxId>): boolean =>
  !failed.has(entry.pass.mailbox.id) && (entry.meta?.emailId ?? null) !== null;

export const freshMeta = async (
  context: SyncContext,
  logger: Logger,
  entries: readonly WindowEntry[],
  failed: Set<MailboxId>,
): Promise<Map<string, RemoteMessageMeta>> => {
  const fresh = new Map<string, RemoteMessageMeta>();
  const candidates = entries.filter((entry) => attachable(entry, failed));
  for (const [mailboxId, group] of byMailbox(candidates)) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }
    const { mailbox, status } = first.pass;
    const known = new Map(group.map((entry) => [entry.uid, entry.meta]));
    const headers = await skipOnUidValidityChange(logger, context, mailbox, () =>
      context.provider.fetchThreadHeaders(mailbox.path, status.uidValidity, [...known.keys()]),
    );
    if (headers === null) {
      failed.add(mailboxId);
      continue;
    }
    headers.forEach((header) => {
      const meta = header.meta ?? known.get(header.uid);
      if (meta !== undefined) {
        fresh.set(entryKey(mailboxId, header.uid), meta);
      }
    });
  }
  return fresh;
};
