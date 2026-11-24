import type { Logger } from '../../ports/logger';
import type { MessageRepository } from '../../ports/message-repository';
import { errorMessage } from '../shared/mail-provider-sessions';
import { type WindowEntry, windowEntry } from './initial-window';
import type { MailboxPass } from './mailbox-synchronizer';
import type { SyncContext } from './sync-context';
import { skipOnUidValidityChange } from './uid-validity-guard';

export interface RelatedMailSearchDeps {
  readonly messages: MessageRepository;
  readonly logger: Logger;
}

export class RelatedMailSearch {
  constructor(private readonly deps: RelatedMailSearchDeps) {}

  async find(
    context: SyncContext,
    pass: MailboxPass,
    ids: readonly string[],
    chunk: readonly WindowEntry[],
  ): Promise<WindowEntry[] | null> {
    try {
      return await skipOnUidValidityChange(this.deps.logger, context, pass.mailbox, () =>
        this.findIn(context, pass, ids, chunk),
      );
    } catch (error) {
      this.deps.logger.warn('Looking up related mail failed, retrying next time', {
        accountId: context.account.id,
        mailboxId: pass.mailbox.id,
        error: errorMessage(error),
      });
      return null;
    }
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
