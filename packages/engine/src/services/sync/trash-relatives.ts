import type { MailboxRole } from '@relay/shared/domain';
import { isHeldRole } from './held-roles';
import type { WindowEntry } from './initial-window';
import type { MailboxPass } from './mailbox-synchronizer';
import type { RelatedMailSearch } from './related-mail-search';
import type { SyncContext } from './sync-context';

export interface TrashRelativesFound {
  readonly entries: readonly WindowEntry[];
  readonly complete: boolean;
}

const RELATED_ROLES: readonly MailboxRole[] = ['inbox', 'archive', 'sent'];

const conversationIds = (entries: readonly WindowEntry[]): string[] => [
  ...new Set(
    entries
      .filter((entry) => isHeldRole(entry.pass.role))
      .flatMap((entry) => [entry.messageId, ...entry.parentIds])
      .filter((id): id is string => id !== null),
  ),
];

export class TrashRelatives {
  constructor(private readonly search: RelatedMailSearch) {}

  async find(
    context: SyncContext,
    chunk: readonly WindowEntry[],
    passes: readonly MailboxPass[],
  ): Promise<TrashRelativesFound> {
    const ids = conversationIds(chunk);
    if (ids.length === 0) {
      return { entries: [], complete: true };
    }
    const entries: WindowEntry[] = [];
    let complete = true;
    for (const pass of passes.filter((candidate) => RELATED_ROLES.includes(candidate.role))) {
      const found = await this.search.find(context, pass, ids, chunk);
      complete = complete && found !== null;
      entries.push(...(found ?? []));
    }
    return { entries, complete };
  }
}
