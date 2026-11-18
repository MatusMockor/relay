import type { Mailbox, ThreadId } from '@relay/shared/domain';
import { ConflictError, ProviderError } from '../../errors';
import type { Clock } from '../../ports/clock';
import type { LabelRepository } from '../../ports/label-repository';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MessageRepository } from '../../ports/message-repository';
import type { LabelRemoval } from '../labels/label-removal';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import { publishThreadOutcomes } from '../shared/thread-refresh';
import type { MailboxEvents } from '../sync/mailbox-events';
import type { MailboxForgetter } from '../sync/mailbox-forgetter';
import { SyncJournal } from '../sync/sync-journal';
import type { FolderEmptier } from './folder-emptier';
import { assertEditableTree } from './folder-guard';
import type { EditableFolder } from './folder-lookup';
import type { FolderThreadRefresher } from './folder-thread-refresh';
import { onMailServer } from './mail-server-call';
import { isInTree, type ListedPath } from './mailbox-path';
import { cachedMessages } from './trashed-copies';

export interface FolderRemoverDeps {
  readonly mailboxes: MailboxRepository;
  readonly messages: MessageRepository;
  readonly labels: LabelRepository;
  readonly labelRemoval: LabelRemoval;
  readonly sessions: MailProviderSessions;
  readonly emptier: FolderEmptier;
  readonly forgetter: MailboxForgetter;
  readonly threads: FolderThreadRefresher;
  readonly mailboxEvents: MailboxEvents;
  readonly events: EngineEvents;
  readonly clock: Clock;
}

const EMPTY_FAILED =
  'Priečinok sa nepodarilo vyprázdniť, preto ostal zachovaný. Správy, ktoré sa už presunuli, sú v Koši.';

const assertNoSubfolders = (mailbox: Mailbox, listed: readonly ListedPath[]): void => {
  if (listed.some((other) => other.path !== mailbox.path && isInTree(mailbox, other.path))) {
    throw new ConflictError('Priečinok obsahuje podpriečinky. Najprv ich presuň alebo zmaž.');
  }
};

const keptPaths = (mailboxes: readonly Mailbox[], removed: Mailbox): string[] =>
  mailboxes.filter((mailbox) => mailbox.id !== removed.id).map((mailbox) => mailbox.path);

export class FolderRemover {
  constructor(private readonly deps: FolderRemoverDeps) {}

  async remove(folder: EditableFolder): Promise<void> {
    const label = folder.mailbox.role === 'label';
    const moved = label ? await this.removeLabel(folder) : await this.removeFolder(folder);
    const forgotten = await this.drop(folder);
    await this.deps.threads.refresh(folder.userId, folder.account, [...moved, ...forgotten]);
    if (label) {
      await this.deps.mailboxEvents.labelsChanged(folder);
    }
    await this.deps.mailboxEvents.mailboxesChanged(folder);
  }

  private async removeFolder(folder: EditableFolder): Promise<ThreadId[]> {
    const { account, mailbox } = folder;
    assertNoSubfolders(mailbox, await this.deps.mailboxes.listForSync(account.id));
    const touched = new Set<ThreadId>();
    const deleted = await onMailServer('delete', mailbox.role, () =>
      this.deps.sessions.with(account, async (provider) => {
        assertNoSubfolders(mailbox, await provider.listMailboxes());
        return this.deps.emptier.deleteWhenEmpty(account, provider, mailbox, touched);
      }),
    ).catch(async (error: unknown) => {
      await this.deps.threads.refresh(folder.userId, account, [...touched]);
      throw error;
    });
    if (!deleted) {
      await this.deps.threads.refresh(folder.userId, account, [...touched]);
      throw new ProviderError(EMPTY_FAILED);
    }
    return [...touched];
  }

  private async removeLabel(folder: EditableFolder): Promise<ThreadId[]> {
    const { account, mailbox, userId } = folder;
    const stored = await this.deps.mailboxes.listForSync(account.id);
    await onMailServer('delete', mailbox.role, () =>
      this.deps.sessions.with(account, async (provider) => {
        assertEditableTree(mailbox, [...stored, ...(await provider.listMailboxes())]);
        await provider.deleteMailbox(mailbox.path);
      }),
    );
    const label = await this.deps.labels.findByRemoteName(account.id, 'gmail', mailbox.path);
    if (label !== null) {
      const outcomes = await this.deps.labelRemoval.run(userId, label);
      await publishThreadOutcomes(this.deps.events, userId, outcomes);
    }
    return [];
  }

  private async drop(folder: EditableFolder): Promise<ThreadId[]> {
    const { account, mailbox } = folder;
    const uids = await this.deps.messages.listUids(mailbox.id);
    const leftovers = await cachedMessages(this.deps.messages, mailbox, uids);
    const journal = new SyncJournal(account.id, this.deps.clock);
    await this.deps.forgetter.forget({ journal }, mailbox);
    const remaining = await this.deps.mailboxes.listForSync(account.id);
    await this.deps.mailboxes.deleteMissing(account.id, keptPaths(remaining, mailbox));
    return leftovers.map((message) => message.threadId);
  }
}
