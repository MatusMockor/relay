import type { MailboxRole } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import type { MessageRepository } from '../../ports/message-repository';
import { type WindowEntry, windowEntry } from './initial-window';
import type { MailboxPass } from './mailbox-synchronizer';
import type { SyncContext } from './sync-context';
import { skipOnUidValidityChange } from './uid-validity-guard';

export interface TrashRelativesDeps {
  readonly messages: MessageRepository;
  readonly logger: Logger;
}

export interface TrashRelativesFound {
  readonly entries: readonly WindowEntry[];
  readonly complete: boolean;
}

const LIVE_ROLES: readonly MailboxRole[] = ['inbox', 'archive'];

const conversationIds = (entries: readonly WindowEntry[]): string[] => [
  ...new Set(
    entries
      .filter((entry) => entry.pass.role === 'trash')
      .flatMap((entry) => [entry.messageId, ...entry.parentIds])
      .filter((id): id is string => id !== null),
  ),
];

export class TrashRelatives {
  constructor(private readonly deps: TrashRelativesDeps) {}

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
    for (const pass of passes.filter((candidate) => LIVE_ROLES.includes(candidate.role))) {
      const found = await skipOnUidValidityChange(this.deps.logger, context, pass.mailbox, () =>
        this.findIn(context, pass, ids, chunk),
      );
      complete = complete && found !== null;
      entries.push(...(found ?? []));
    }
    return { entries, complete };
  }

  private async findIn(
    context: SyncContext,
    pass: MailboxPass,
    ids: readonly string[],
    chunk: readonly WindowEntry[],
  ): Promise<WindowEntry[]> {
    const { path } = pass.mailbox;
    const { uidValidity } = pass.status;
    const found = await context.provider.searchRelated(path, uidValidity, ids);
    const known = new Set([
      ...(await this.deps.messages.listUids(pass.mailbox.id)),
      ...chunk.filter((entry) => entry.pass.mailbox.id === pass.mailbox.id).map(({ uid }) => uid),
    ]);
    const missing = found.filter((uid) => !known.has(uid));
    if (missing.length === 0) {
      return [];
    }
    const headers = await context.provider.fetchThreadHeaders(path, uidValidity, missing);
    return headers.map((header) => windowEntry(pass, header, true));
  }
}
