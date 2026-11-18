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
import type { FolderEmptier } from './folder-emptier';
import { assertEditableTree } from './folder-guard';
import type { GmailFolderLabels } from './gmail-folder-labels';
import { onMailServer } from './mail-server-call';
import { isInTree, type ListedPath } from './mailbox-path';

export interface FolderRemoverDeps {
  readonly mailboxes: MailboxRepository;
  readonly sessions: MailProviderSessions;
  readonly emptier: FolderEmptier;
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
    assertNoSubfolders(mailbox, await this.deps.mailboxes.listForSync(account.id));
    const outcome = await onMailServer('delete', mailbox.role, () =>
      this.deps.sessions.with(account, async (provider) => {
        assertNoSubfolders(mailbox, await provider.listMailboxes());
        return this.deps.emptier.deleteWhenEmpty(account, provider, mailbox);
      }),
    );
    if (!outcome.deleted) {
      await this.deps.threads.refresh(folder.userId, account, outcome.threadIds);
      throw new ProviderError(
        'Priečinok sa nepodarilo vyprázdniť, preto ostal zachovaný. Správy, ktoré sa už presunuli, sú v Koši.',
      );
    }
    return [...outcome.threadIds];
  }

  private async removeLabel(folder: EditableFolder): Promise<ThreadId[]> {
    const stored = await this.deps.mailboxes.listForSync(folder.account.id);
    await onMailServer('delete', folder.mailbox.role, () =>
      this.deps.sessions.with(folder.account, async (provider) => {
        assertEditableTree(folder.mailbox, [...stored, ...(await provider.listMailboxes())]);
        await provider.deleteMailbox(folder.mailbox.path);
      }),
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

const assertNoSubfolders = (mailbox: Mailbox, listed: readonly ListedPath[]): void => {
  if (
    listed.some((candidate) => candidate.path !== mailbox.path && isInTree(mailbox, candidate.path))
  ) {
    throw new ConflictError('Priečinok obsahuje podpriečinky. Najprv ich presuň alebo zmaž.');
  }
};

const keptPaths = (mailboxes: readonly Mailbox[], removed: Mailbox): string[] =>
  mailboxes.filter((mailbox) => mailbox.id !== removed.id).map((mailbox) => mailbox.path);
