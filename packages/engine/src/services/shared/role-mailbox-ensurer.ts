import type { MailAccount, Mailbox, MailboxRole } from '@relay/shared/domain';
import type { RemoteMailbox } from '../../model/remote-mail';
import type { IdGenerator } from '../../ports/id-generator';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';

export const CREATABLE_MAILBOX_NAMES: Readonly<Partial<Record<MailboxRole, string>>> = {
  archive: 'Archive',
  sent: 'Sent',
  trash: 'Trash',
  drafts: 'Drafts',
  spam: 'Junk',
};

export interface RoleMailboxEnsurerDeps {
  readonly mailboxes: MailboxRepository;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export class RoleMailboxEnsurer {
  private readonly pending = new Map<string, Promise<Mailbox>>();

  constructor(private readonly deps: RoleMailboxEnsurerDeps) {}

  async ensure(
    account: MailAccount,
    role: MailboxRole,
    provider: MailProvider,
  ): Promise<Mailbox | null> {
    const stored = await this.deps.mailboxes.findByRole(account.id, role);
    if (stored !== null) {
      return stored;
    }
    const name = CREATABLE_MAILBOX_NAMES[role];
    if (name === undefined) {
      return null;
    }
    const key = `${account.id}:${role}`;
    const running = this.pending.get(key);
    if (running !== undefined) {
      return running;
    }
    const created = this.provision(account, role, name, provider).finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, created);
    return created;
  }

  private async provision(
    account: MailAccount,
    role: MailboxRole,
    name: string,
    provider: MailProvider,
  ): Promise<Mailbox> {
    const listed = (await provider.listMailboxes()).find((mailbox) => mailbox.role === role);
    const remote = listed ?? (await provider.createMailbox(name));
    if (listed === undefined) {
      this.deps.logger.info('Created a missing mailbox on the mail server', {
        accountId: account.id,
        role,
        path: remote.path,
      });
    }
    return this.store(account, role, remote);
  }

  private async store(
    account: MailAccount,
    role: MailboxRole,
    remote: RemoteMailbox,
  ): Promise<Mailbox> {
    const known = await this.deps.mailboxes.findByPath(account.id, remote.path);
    const mailbox: Mailbox = {
      id: known?.id ?? this.deps.ids.generate('mailbox'),
      accountId: account.id,
      name: remote.name,
      path: remote.path,
      delimiter: remote.delimiter,
      role,
      subscribed: remote.subscribed,
      uidValidity: known?.uidValidity ?? null,
      unreadCount: known?.unreadCount ?? 0,
      totalCount: known?.totalCount ?? 0,
    };
    const [stored] = await this.deps.mailboxes.upsertMany(account.id, [mailbox]);
    return stored ?? mailbox;
  }
}
