import type { AccountId, Label, MailAccount, Mailbox } from '@relay/shared/domain';
import type { RemoteMailbox } from '../../model/remote-mail';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';

export interface GmailLabelAdminDeps {
  readonly labels: LabelRepository;
  readonly mailboxes: MailboxRepository;
  readonly sessions: MailProviderSessions;
  readonly ids: IdGenerator;
}

const DEFAULT_DELIMITER = '/';

const leafOf = (path: string, delimiter: string): string => path.split(delimiter).pop() ?? path;

const isWithin = (path: string, root: string, delimiter: string): boolean =>
  path === root || path.startsWith(`${root}${delimiter}`);

export class GmailLabelAdmin {
  constructor(private readonly deps: GmailLabelAdminDeps) {}

  async create(account: MailAccount, name: string, color: string | null): Promise<Label> {
    const remote = await this.deps.sessions.with(account, (provider) =>
      provider.createMailbox(name),
    );
    await this.storeMailbox(account.id, remote);
    const existing = await this.deps.labels.findByRemoteName(account.id, 'gmail', remote.path);
    return this.deps.labels.upsert({
      id: existing?.id ?? this.deps.ids.generate('label'),
      accountId: account.id,
      name: remote.path,
      color: color ?? existing?.color ?? null,
      kind: 'gmail',
      remoteName: remote.path,
    });
  }

  async rename(account: MailAccount, label: Label, name: string): Promise<Label> {
    const mailbox = await this.deps.mailboxes.findByPath(account.id, label.remoteName);
    const remote = await this.deps.sessions.with(account, (provider) =>
      provider.renameMailbox(label.remoteName, name),
    );
    const delimiter = mailbox?.delimiter ?? remote.delimiter ?? DEFAULT_DELIMITER;
    await this.relocateTree(account.id, label.remoteName, remote.path, delimiter);
    return { ...label, name: remote.path, remoteName: remote.path };
  }

  async remove(account: MailAccount, label: Label): Promise<void> {
    await this.deps.sessions.with(account, (provider) => provider.deleteMailbox(label.remoteName));
  }

  private async storeMailbox(accountId: AccountId, remote: RemoteMailbox): Promise<void> {
    const known = await this.deps.mailboxes.findByPath(accountId, remote.path);
    const mailbox: Mailbox = {
      id: known?.id ?? this.deps.ids.generate('mailbox'),
      accountId,
      name: remote.name,
      path: remote.path,
      delimiter: remote.delimiter,
      role: remote.role,
      subscribed: remote.subscribed,
      uidValidity: known?.uidValidity ?? null,
      unreadCount: known?.unreadCount ?? 0,
      totalCount: known?.totalCount ?? 0,
    };
    await this.deps.mailboxes.upsertMany(accountId, [mailbox]);
  }

  private async relocateTree(
    accountId: AccountId,
    from: string,
    to: string,
    delimiter: string,
  ): Promise<void> {
    const labels = await this.deps.labels.listByKind(accountId, 'gmail');
    for (const label of labels.filter((item) => isWithin(item.remoteName, from, delimiter))) {
      const path = `${to}${label.remoteName.slice(from.length)}`;
      const mailbox = await this.deps.mailboxes.findByPath(accountId, label.remoteName);
      if (mailbox !== null) {
        await this.deps.mailboxes.relocate(mailbox.id, {
          path,
          name: leafOf(path, delimiter),
          delimiter: mailbox.delimiter,
        });
      }
      await this.deps.labels.upsert({ ...label, name: path, remoteName: path });
    }
  }
}
