import type { MailboxId, MailboxRole } from '@relay/shared/domain';
import type { InitialSyncWindow } from '../../model/sync-state';
import type { MessageRepository } from '../../ports/message-repository';
import { completedSyncState } from './completed-sync-state';
import { cutoffOf, type WindowEntry } from './initial-window';
import type { MailboxPass } from './mailbox-synchronizer';
import type { RelatedMailSearch } from './related-mail-search';
import type { SyncContext } from './sync-context';

export interface InboxAncestorsDeps {
  readonly messages: MessageRepository;
  readonly search: RelatedMailSearch;
}

const DAY_MS = 86_400_000;
const ANCESTOR_ROLES: ReadonlySet<MailboxRole> = new Set(['sent', 'archive']);

const missingParents = (head: readonly WindowEntry[]): string[] => {
  const own = new Set(head.flatMap((entry) => (entry.messageId === null ? [] : [entry.messageId])));
  return [...new Set(head.flatMap((entry) => entry.parentIds))].filter((id) => !own.has(id));
};

const searched = (pass: MailboxPass): boolean =>
  ANCESTOR_ROLES.has(pass.role) && completedSyncState(pass.state) === null;

const inWindow = (entry: WindowEntry, frozen: InitialSyncWindow): boolean => {
  const window = entry.pass.state?.initialWindow ?? null;
  if (window === null) {
    return entry.arrivedAt >= cutoffOf(entry.pass, frozen);
  }
  return entry.uid >= window.floorUid && entry.arrivedAt >= cutoffOf(entry.pass, window);
};

const sinceOf = (pass: MailboxPass, frozen: InitialSyncWindow): Date | undefined => {
  const window = pass.state?.initialWindow ?? frozen;
  const cutoff = cutoffOf(pass, window);
  return Number.isFinite(cutoff) ? new Date(cutoff - DAY_MS) : undefined;
};

const recordMisses = (
  misses: Map<MailboxId, Set<string>>,
  mailboxId: MailboxId,
  queried: readonly string[],
  matched: ReadonlySet<string>,
): void => {
  let seen = misses.get(mailboxId);
  if (seen === undefined) {
    seen = new Set();
    misses.set(mailboxId, seen);
  }
  for (const id of queried) {
    if (!matched.has(id)) {
      seen.add(id);
    }
  }
};

export class InboxAncestors {
  constructor(private readonly deps: InboxAncestorsDeps) {}

  async find(
    context: SyncContext,
    head: readonly WindowEntry[],
    passes: readonly MailboxPass[],
    frozen: InitialSyncWindow,
    misses: Map<MailboxId, Set<string>> = new Map(),
  ): Promise<WindowEntry[] | null> {
    const remaining = await this.unknown(context, missingParents(head));
    if (remaining.size === 0) {
      return [];
    }
    const found: WindowEntry[] = [];
    for (const pass of passes.filter(searched)) {
      if (remaining.size === 0) {
        break;
      }
      const priorMisses = misses.get(pass.mailbox.id);
      const queried = [...remaining].filter((id) => !priorMisses?.has(id));
      if (queried.length === 0) {
        continue;
      }
      const entries = await this.deps.search.find(context, pass, queried, head, {
        match: 'message-id',
        since: sinceOf(pass, frozen),
      });
      if (entries === null) {
        return null;
      }
      const matched = new Set<string>();
      for (const entry of entries) {
        if (entry.messageId !== null && remaining.has(entry.messageId)) {
          matched.add(entry.messageId);
          if (inWindow(entry, frozen)) {
            found.push(entry);
            remaining.delete(entry.messageId);
          }
        }
      }
      recordMisses(misses, pass.mailbox.id, queried, matched);
    }
    return found;
  }

  private async unknown(context: SyncContext, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const stored = await this.deps.messages.findByMessageIdHeaders(context.account.id, ids);
    const known = new Set(stored.map((message) => message.messageIdHeader));
    return new Set(ids.filter((id) => !known.has(id)));
  }
}
