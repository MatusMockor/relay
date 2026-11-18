import type { MailAccount, Mailbox, ThreadId } from '@relay/shared/domain';
import type { RemoteMailboxStatus } from '../../model/remote-mail';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { MessageRepository } from '../../ports/message-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';
import { cachedMessages, type TrashedCopies } from './trashed-copies';

export interface FolderEmptierDeps {
  readonly messages: MessageRepository;
  readonly syncStates: SyncStateRepository;
  readonly roleMailboxes: RoleMailboxEnsurer;
  readonly copies: TrashedCopies;
  readonly logger: Logger;
}

export const MAX_EMPTY_ROUNDS = 3;

const FRESH = { fresh: true } as const;

export class FolderEmptier {
  constructor(private readonly deps: FolderEmptierDeps) {}

  async deleteWhenEmpty(
    account: MailAccount,
    provider: MailProvider,
    folder: Mailbox,
    touched: Set<ThreadId>,
  ): Promise<boolean> {
    const trash = await this.deps.roleMailboxes.ensure(account, 'trash', provider);
    if (trash === null) {
      return false;
    }
    for (let round = 0; round <= MAX_EMPTY_ROUNDS; round += 1) {
      const status = await provider.status(folder.path);
      if (status.messages === 0 && (await provider.listUids(folder.path, FRESH)).length === 0) {
        await provider.deleteMailbox(folder.path);
        return true;
      }
      if (round === MAX_EMPTY_ROUNDS) {
        return false;
      }
      const moved = await this.moveRound(account, provider, { folder, trash, status }, touched);
      if (!moved) {
        return false;
      }
    }
    return false;
  }

  private async moveRound(
    account: MailAccount,
    provider: MailProvider,
    round: {
      readonly folder: Mailbox;
      readonly trash: Mailbox;
      readonly status: RemoteMailboxStatus;
    },
    touched: Set<ThreadId>,
  ): Promise<boolean> {
    const { folder, trash } = round;
    const uids = await provider.listUids(folder.path, FRESH);
    if (uids.length === 0) {
      return true;
    }
    const trusted = await this.trustsCachedUids(provider, round);
    const messages = trusted ? await cachedMessages(this.deps.messages, folder, uids) : [];
    const result = await provider.move(folder.path, uids, trash.path).catch((error: unknown) => {
      this.deps.logger.warn('Moving the mail of a deleted folder to Trash failed', {
        accountId: account.id,
        path: folder.path,
        error: errorMessage(error),
      });
      return null;
    });
    if (result === null) {
      return false;
    }
    const threadIds = await this.deps.copies.record(account, folder, trash, {
      messages,
      uidMap: result.uidMap,
    });
    threadIds.forEach((threadId) => touched.add(threadId));
    return true;
  }

  private async trustsCachedUids(
    provider: MailProvider,
    round: {
      readonly folder: Mailbox;
      readonly trash: Mailbox;
      readonly status: RemoteMailboxStatus;
    },
  ): Promise<boolean> {
    const source = await this.deps.syncStates.find(round.folder.id);
    const target = await this.deps.syncStates.find(round.trash.id);
    if (source?.uidValidity !== round.status.uidValidity) {
      return false;
    }
    return (
      target === null ||
      (await provider.status(round.trash.path)).uidValidity === target.uidValidity
    );
  }
}
