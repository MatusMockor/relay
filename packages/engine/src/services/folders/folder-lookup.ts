import type { AccountId, MailAccount, Mailbox, MailboxId, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import { assertEditable } from './folder-guard';

export interface FolderScope {
  readonly userId: UserId;
  readonly account: MailAccount;
}

export interface EditableFolder extends FolderScope {
  readonly mailbox: Mailbox;
}

export class FolderLookup {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly mailboxes: MailboxRepository,
  ) {}

  async scope(userId: UserId, accountId: AccountId): Promise<FolderScope> {
    const account = await this.accounts.findById(userId, accountId);
    if (account === null) {
      throw new NotFoundError('Account', accountId);
    }
    return { userId, account };
  }

  async folder(userId: UserId, mailboxId: MailboxId): Promise<EditableFolder> {
    const mailbox = await this.mailboxes.findById(mailboxId);
    if (mailbox === null) {
      throw new NotFoundError('Mailbox', mailboxId);
    }
    const scope = await this.scope(userId, mailbox.accountId);
    assertEditable(mailbox);
    return { ...scope, mailbox };
  }

  async parent(scope: FolderScope, mailboxId: MailboxId): Promise<Mailbox> {
    const mailbox = await this.mailboxes.findById(mailboxId);
    if (mailbox === null || mailbox.accountId !== scope.account.id) {
      throw new NotFoundError('Mailbox', mailboxId);
    }
    assertEditable(mailbox);
    return mailbox;
  }
}
