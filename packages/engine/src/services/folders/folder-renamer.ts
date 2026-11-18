import type { Mailbox, MailboxId } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../errors';
import type { RemoteMailbox } from '../../model/remote-mail';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { MailboxEvents } from '../sync/mailbox-events';
import { assertEditableTree } from './folder-guard';
import type { EditableFolder, FolderLookup } from './folder-lookup';
import type { GmailFolderLabels, PathRename } from './gmail-folder-labels';
import { onMailServer } from './mail-server-call';
import {
  accountDelimiter,
  assertFreePath,
  childPath,
  type FolderParent,
  isInTree,
  leafName,
  parentOf,
  validFolderName,
} from './mailbox-path';

export interface FolderChange {
  readonly name?: string;
  readonly parentId?: MailboxId | null;
}

export interface FolderRenamerDeps {
  readonly mailboxes: MailboxRepository;
  readonly unitOfWork: UnitOfWork;
  readonly lookup: FolderLookup;
  readonly sessions: MailProviderSessions;
  readonly gmailLabels: GmailFolderLabels;
  readonly events: MailboxEvents;
}

const treeRenames = (tree: readonly Mailbox[], from: string, to: string): PathRename[] =>
  tree.map((mailbox) => ({ from: mailbox.path, to: `${to}${mailbox.path.slice(from.length)}` }));

export class FolderRenamer {
  constructor(private readonly deps: FolderRenamerDeps) {}

  async update(folder: EditableFolder, change: FolderChange): Promise<Mailbox> {
    const { mailbox } = folder;
    const parent = await this.parent(folder, change.parentId);
    const stored = await this.deps.mailboxes.listForSync(folder.account.id);
    const delimiter = mailbox.delimiter ?? accountDelimiter(stored);
    const name = validFolderName(change.name ?? leafName(mailbox), delimiter);
    if (parent !== null && isInTree(mailbox, parent.path)) {
      throw new ValidationError(
        'Priečinok nie je možné presunúť do seba ani do svojho podpriečinka.',
      );
    }
    const target = childPath(name, parent, stored);
    if (target === mailbox.path) {
      return mailbox;
    }
    const remote = await onMailServer('rename', mailbox.role, () =>
      this.deps.sessions.with(folder.account, async (provider) => {
        const listed = [...stored, ...(await provider.listMailboxes())];
        assertEditableTree(mailbox, listed);
        assertFreePath(target, listed, mailbox);
        return provider.renameMailbox(mailbox.path, target);
      }),
    );
    await this.relocate(folder, stored, remote);
    return this.reloaded(mailbox.id);
  }

  private async parent(
    folder: EditableFolder,
    parentId: MailboxId | null | undefined,
  ): Promise<FolderParent | null> {
    if (parentId === undefined) {
      return parentOf(folder.mailbox);
    }
    return parentId === null ? null : this.deps.lookup.parent(folder, parentId);
  }

  private async relocate(
    folder: EditableFolder,
    stored: readonly Mailbox[],
    remote: RemoteMailbox,
  ): Promise<void> {
    const { account, mailbox } = folder;
    const tree = stored.filter((candidate) => isInTree(mailbox, candidate.path));
    const location = { path: remote.path, name: remote.name, delimiter: remote.delimiter };
    await this.deps.unitOfWork.run(async (repositories) => {
      await repositories.mailboxes.relocateTree(account.id, mailbox.path, location);
      if (mailbox.role === 'label') {
        const renames = treeRenames(tree, mailbox.path, remote.path);
        await this.deps.gmailLabels.rename(repositories.labels, account.id, renames);
      }
    });
    if (mailbox.role === 'label') {
      await this.deps.events.labelsChanged(folder);
    }
    await this.deps.events.mailboxesChanged(folder);
  }

  private async reloaded(mailboxId: MailboxId): Promise<Mailbox> {
    const mailbox = await this.deps.mailboxes.findById(mailboxId);
    if (mailbox === null) {
      throw new NotFoundError('Mailbox', mailboxId);
    }
    return mailbox;
  }
}
