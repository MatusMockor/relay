import type { MailAccount, Mailbox } from '@relay/shared/domain';
import type { ProviderChange } from '../../model/pending-work';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';

type MoveChange = Extract<ProviderChange, { kind: 'move' }>;

export class MoveTargetResolver {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly roleMailboxes: RoleMailboxEnsurer,
  ) {}

  async resolve(
    account: MailAccount,
    provider: MailProvider,
    change: MoveChange,
  ): Promise<Mailbox> {
    const exact = await this.exact(account, change);
    if (exact !== null) {
      return exact;
    }
    const role = change.role === 'custom' ? 'inbox' : change.role;
    const target = await this.roleMailboxes.ensure(account, role, provider);
    if (target === null) {
      throw new Error(`No ${role} mailbox to move messages to`);
    }
    return target;
  }

  private async exact(account: MailAccount, change: MoveChange): Promise<Mailbox | null> {
    if (change.mailboxId === undefined) {
      return null;
    }
    const mailbox = await this.mailboxes.findById(change.mailboxId);
    return mailbox?.accountId === account.id ? mailbox : null;
  }
}
