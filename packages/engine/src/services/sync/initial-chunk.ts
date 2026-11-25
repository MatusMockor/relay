import type { MailboxId } from '@relay/shared/domain';
import type { RawMessage } from '../../model/remote-mail';
import type { Logger } from '../../ports/logger';
import type { WindowEntry } from './initial-window';
import type { SyncContext } from './sync-context';
import { skipOnUidValidityChange } from './uid-validity-guard';

export const entryKey = (mailboxId: MailboxId, uid: number): string =>
  `${mailboxId}:${String(uid)}`;

const collect = async (items: AsyncIterable<RawMessage>): Promise<RawMessage[]> => {
  const collected: RawMessage[] = [];
  for await (const item of items) {
    collected.push(item);
  }
  return collected;
};

export const byMailbox = (chunk: readonly WindowEntry[]): Map<MailboxId, WindowEntry[]> => {
  const grouped = new Map<MailboxId, WindowEntry[]>();
  chunk.forEach((entry) => {
    const id = entry.pass.mailbox.id;
    const entries = grouped.get(id);
    if (entries === undefined) {
      grouped.set(id, [entry]);
      return;
    }
    entries.push(entry);
  });
  return grouped;
};

export const fetchChunk = async (
  context: SyncContext,
  logger: Logger,
  chunk: readonly WindowEntry[],
  failed: Set<MailboxId>,
): Promise<Map<string, RawMessage>> => {
  const fetched = new Map<string, RawMessage>();
  for (const [mailboxId, entries] of byMailbox(chunk)) {
    const first = entries[0];
    if (first === undefined || failed.has(mailboxId)) {
      continue;
    }
    const { mailbox, status } = first.pass;
    const uids = entries.map((entry) => entry.uid);
    const messages = await skipOnUidValidityChange(logger, context, mailbox, () =>
      collect(context.provider.fetchUids(mailbox.path, status.uidValidity, uids)),
    );
    if (messages === null) {
      failed.add(mailboxId);
      continue;
    }
    messages.forEach((message) => fetched.set(entryKey(mailboxId, message.uid), message));
  }
  return fetched;
};
