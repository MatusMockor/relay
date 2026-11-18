import type { Mailbox, MailboxId } from '@relay/shared/domain';
import type { RemoteMailbox } from '../../model/remote-mail';
import type { IdGenerator } from '../../ports/id-generator';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { MailboxEvents } from '../sync/mailbox-events';
import type { FolderLookup, FolderScope } from './folder-lookup';
import type { GmailFolderLabels } from './gmail-folder-labels';
import { onMailServer } from './mail-server-call';
import { accountDelimiter, assertFreePath, childPath, validFolderName } from './mailbox-path';

export interface FolderCreatorDeps {
  readonly mailboxes: MailboxRepository;
  readonly lookup: FolderLookup;
  readonly sessions: MailProviderSessions;
  readonly gmailLabels: GmailFolderLabels;
  readonly events: MailboxEvents;
  readonly ids: IdGenerator;
}

export class FolderCreator {
  constructor(private readonly deps: FolderCreatorDeps) {}

  async create(scope: FolderScope, rawName: string, parentId: MailboxId | null): Promise<Mailbox> {
    const parent = parentId === null ? null : await this.deps.lookup.parent(scope, parentId);
    const stored = await this.deps.mailboxes.listForSync(scope.account.id);
    const role = parent?.role ?? null;
    const created = await onMailServer('create', role, () =>
      this.deps.sessions.with(scope.account, async (provider) => {
        const listed = [...stored, ...(await provider.listMailboxes())];
        const name = validFolderName(rawName, parent?.delimiter ?? accountDelimiter(listed));
        assertFreePath(childPath(name, parent, listed), listed);
        const remote = await provider.createMailbox(name, parent?.path);
        return this.store(scope, provider, remote);
      }),
    );
    if (created.role === 'label') {
      await this.deps.gmailLabels.adopt(created);
      await this.deps.events.labelsChanged(scope);
    }
    await this.deps.events.mailboxesChanged(scope);
    return created;
  }

  private async store(
    scope: FolderScope,
    provider: MailProvider,
    remote: RemoteMailbox,
  ): Promise<Mailbox> {
    const status = await provider.status(remote.path).catch(() => null);
    const mailbox: Mailbox = {
      id: this.deps.ids.generate('mailbox'),
      accountId: scope.account.id,
      name: remote.name,
      path: remote.path,
      delimiter: remote.delimiter,
      role: remote.role,
      subscribed: remote.subscribed,
      uidValidity: status?.uidValidity ?? null,
      unreadCount: status?.unseen ?? 0,
      totalCount: status?.messages ?? 0,
    };
    const [stored] = await this.deps.mailboxes.upsertMany(scope.account.id, [mailbox]);
    return stored ?? mailbox;
  }
}
