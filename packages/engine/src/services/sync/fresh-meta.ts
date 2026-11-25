import type { MailboxId } from '@relay/shared/domain';
import type { RemoteMessageMeta } from '../../model/remote-mail';
import type { Logger } from '../../ports/logger';
import { byMailbox, entryKey } from './initial-chunk';
import type { WindowEntry } from './initial-window';
import type { SyncContext } from './sync-context';
import { skipOnUidValidityChange } from './uid-validity-guard';

export type CanAttachMeta = (entry: WindowEntry, meta: RemoteMessageMeta) => Promise<boolean>;

const attachCandidates = async (
  entries: readonly WindowEntry[],
  failed: ReadonlySet<MailboxId>,
  canAttach: CanAttachMeta,
): Promise<WindowEntry[]> => {
  const seen = new Set<string>();
  const candidates: WindowEntry[] = [];
  for (const entry of entries) {
    const { meta } = entry;
    const emailId = meta?.emailId ?? null;
    if (meta === undefined || emailId === null || failed.has(entry.pass.mailbox.id)) {
      continue;
    }
    if (seen.has(emailId) || (await canAttach(entry, meta))) {
      candidates.push(entry);
    }
    seen.add(emailId);
  }
  return candidates;
};

export const freshMeta = async (
  context: SyncContext,
  logger: Logger,
  entries: readonly WindowEntry[],
  failed: Set<MailboxId>,
  canAttach: CanAttachMeta,
): Promise<Map<string, RemoteMessageMeta>> => {
  const fresh = new Map<string, RemoteMessageMeta>();
  const candidates = await attachCandidates(entries, failed, canAttach);
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
