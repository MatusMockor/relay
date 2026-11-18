import type { Mailbox, ThreadId } from '@relay/shared/domain';
import { ConflictError, ProviderError } from '../../errors';
import type { Clock } from '../../ports/clock';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { MailboxEvents } from '../sync/mailbox-events';
import type { MailboxForgetter } from '../sync/mailbox-forgetter';
import { SyncJournal } from '../sync/sync-journal';
import type { EditableFolder } from './folder-lookup';
import type { FolderThreadRefresher } from './folder-thread-refresh';
import type { FolderTrash } from './folder-trash';
import type { GmailFolderLabels } from './gmail-folder-labels';
import { onMailServer } from './mail-server-call';
import { isInTree } from './mailbox-path';

export interface FolderRemoverDeps {
  readonly mailboxes: MailboxRepository;
  readonly sessions: MailProviderSessions;
  readonly trash: FolderTrash;
  readonly forgetter: MailboxForgetter;
  readonly gmailLabels: GmailFolderLabels;
  readonly threads: FolderThreadRefresher;
  readonly events: MailboxEvents;
  readonly clock: Clock;
}

export class FolderRemover {
  constructor(private readonly deps: FolderRemoverDeps) {}

  async remove(folder: EditableFolder): Promise<void> {
    const threadIds =
      folder.mailbox.role === 'label'
        ? await this.removeLabel(folder)
        : await this.removeFolder(folder);
    await this.drop(folder);
    await this.deps.threads.refresh(folder.userId, folder.account, threadIds);
    if (folder.mailbox.role === 'label') {
      await this.deps.events.labelsChanged(folder);
    }
    await this.deps.events.mailboxesChanged(folder);
  }

  private async removeFolder(folder: EditableFolder): Promise<ThreadId[]> {
    const { account, mailbox } = folder;
    const stored = await this.deps.mailboxes.listForSync(account.id);
    if (
      stored.some((candidate) => candidate.id !== mailbox.id && isInTree(mailbox, candidate.path))
    ) {
      throw new ConflictError('Priečinok obsahuje podpriečinky. Najprv ich presuň alebo zmaž.');
    }
    const outcome = await onMailServer('delete', mailbox.role, () =>
      this.deps.sessions.with(account, async (provider) => {
        const emptied = await this.deps.trash.empty(account, provider, mailbox);
        if (emptied.complete) {
          await provider.deleteMailbox(mailbox.path);
        }
        return emptied;
      }),
    );
    if (!outcome.complete) {
      await this.deps.threads.refresh(folder.userId, account, outcome.threadIds);
      throw new ProviderError('Správy sa nepodarilo presunúť do Koša, priečinok ostal zachovaný.');
    }
    return [...outcome.threadIds];
  }

  private async removeLabel(folder: EditableFolder): Promise<ThreadId[]> {
    await onMailServer('delete', folder.mailbox.role, () =>
      this.deps.sessions.with(folder.account, (provider) =>
        provider.deleteMailbox(folder.mailbox.path),
      ),
    );
    return this.deps.gmailLabels.remove(folder.userId, folder.mailbox);
  }

  private async drop(folder: EditableFolder): Promise<void> {
    const { account, mailbox } = folder;
    const journal = new SyncJournal(account.id, this.deps.clock);
    await this.deps.forgetter.forget({ journal }, mailbox);
    const remaining = await this.deps.mailboxes.listForSync(account.id);
    await this.deps.mailboxes.deleteMissing(account.id, keptPaths(remaining, mailbox));
  }
}

const keptPaths = (mailboxes: readonly Mailbox[], removed: Mailbox): string[] =>
  mailboxes.filter((mailbox) => mailbox.id !== removed.id).map((mailbox) => mailbox.path);
