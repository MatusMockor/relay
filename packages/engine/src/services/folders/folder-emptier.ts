import type { MailAccount, Mailbox, ThreadId } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';
import type { TrashedCopies } from './trashed-copies';

export interface FolderEmptierDeps {
  readonly roleMailboxes: RoleMailboxEnsurer;
  readonly copies: TrashedCopies;
  readonly logger: Logger;
}

export interface EmptiedFolder {
  readonly threadIds: readonly ThreadId[];
  readonly deleted: boolean;
}

export const MAX_EMPTY_ROUNDS = 3;

export class FolderEmptier {
  constructor(private readonly deps: FolderEmptierDeps) {}

  async deleteWhenEmpty(
    account: MailAccount,
    provider: MailProvider,
    folder: Mailbox,
  ): Promise<EmptiedFolder> {
    const trash = await this.deps.roleMailboxes.ensure(account, 'trash', provider);
    const threadIds = new Set<ThreadId>();
    if (trash === null) {
      return { threadIds: [], deleted: false };
    }
    for (let round = 0; round <= MAX_EMPTY_ROUNDS; round += 1) {
      if (await this.confirmedEmpty(provider, folder)) {
        await provider.deleteMailbox(folder.path);
        return { threadIds: [...threadIds], deleted: true };
      }
      if (round === MAX_EMPTY_ROUNDS) {
        break;
      }
      const moved = await this.moveRound(account, provider, folder, trash);
      moved?.forEach((threadId) => threadIds.add(threadId));
      if (moved === null) {
        break;
      }
    }
    return { threadIds: [...threadIds], deleted: false };
  }

  private async confirmedEmpty(provider: MailProvider, folder: Mailbox): Promise<boolean> {
    const status = await provider.status(folder.path);
    if (status.messages > 0) {
      return false;
    }
    return (await provider.listUids(folder.path)).length === 0;
  }

  private async moveRound(
    account: MailAccount,
    provider: MailProvider,
    folder: Mailbox,
    trash: Mailbox,
  ): Promise<ThreadId[] | null> {
    const uids = await provider.listUids(folder.path);
    if (uids.length === 0) {
      return [];
    }
    const messages = await this.deps.copies.cached(folder, uids);
    const result = await provider.move(folder.path, uids, trash.path).catch((error: unknown) => {
      this.deps.logger.warn('Moving the mail of a deleted folder to Trash failed', {
        accountId: account.id,
        path: folder.path,
        error: errorMessage(error),
      });
      return null;
    });
    if (result === null) {
      return null;
    }
    return this.deps.copies.record(account, folder, trash, { messages, uidMap: result.uidMap });
  }
}
