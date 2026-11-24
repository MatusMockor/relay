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

const missingParents = (head: readonly WindowEntry[]): string[] => {
  const own = new Set(head.flatMap((entry) => (entry.messageId === null ? [] : [entry.messageId])));
  return [...new Set(head.flatMap((entry) => entry.parentIds))].filter((id) => !own.has(id));
};

const searched = (pass: MailboxPass): boolean =>
  pass.role !== 'inbox' && completedSyncState(pass.state) === null;

const inWindow = (entry: WindowEntry, frozen: InitialSyncWindow): boolean => {
  const window = entry.pass.state?.initialWindow ?? null;
  if (window === null) {
    return entry.arrivedAt >= cutoffOf(entry.pass, frozen);
  }
  return entry.uid >= window.floorUid && entry.arrivedAt >= cutoffOf(entry.pass, window);
};

export class InboxAncestors {
  constructor(private readonly deps: InboxAncestorsDeps) {}

  async find(
    context: SyncContext,
    head: readonly WindowEntry[],
    passes: readonly MailboxPass[],
    frozen: InitialSyncWindow,
  ): Promise<WindowEntry[] | null> {
    const ids = await this.unknown(context, missingParents(head));
    if (ids.size === 0) {
      return [];
    }
    const found: WindowEntry[] = [];
    for (const pass of passes.filter(searched)) {
      const entries = await this.deps.search.find(context, pass, [...ids], head);
      if (entries === null) {
        return null;
      }
      found.push(
        ...entries.filter(
          (entry) =>
            entry.messageId !== null && ids.has(entry.messageId) && inWindow(entry, frozen),
        ),
      );
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
