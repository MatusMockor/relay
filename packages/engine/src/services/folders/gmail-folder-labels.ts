import type { AccountId, Label, Mailbox, ThreadId, UserId } from '@relay/shared/domain';
import { ValidationError } from '../../errors';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import { isValidLabel } from '../sync/valid-label';

export interface PathRename {
  readonly from: string;
  readonly to: string;
}

export interface GmailFolderLabelsDeps {
  readonly labels: LabelRepository;
  readonly threads: ThreadRepository;
  readonly ids: IdGenerator;
}

const PAGE_SIZE = 200;

export class GmailFolderLabels {
  constructor(private readonly deps: GmailFolderLabelsDeps) {}

  async adopt(mailbox: Mailbox): Promise<void> {
    const { accountId, path } = mailbox;
    if (await this.deps.labels.findByRemoteName(accountId, 'gmail', path)) {
      return;
    }
    const sameName = await this.deps.labels.findByName(accountId, path);
    const label: Label = {
      id: sameName?.id ?? this.deps.ids.generate('label'),
      accountId,
      name: path,
      color: sameName?.color ?? null,
      kind: 'gmail',
      remoteName: path,
    };
    if (!isValidLabel(label)) {
      throw new ValidationError('Názov štítka je príliš dlhý.');
    }
    await this.deps.labels.upsert(label);
  }

  async rename(
    labels: LabelRepository,
    accountId: AccountId,
    renames: readonly PathRename[],
  ): Promise<void> {
    for (const { from, to } of renames) {
      const label = await labels.findByRemoteName(accountId, 'gmail', from);
      if (label !== null) {
        await labels.upsert({ ...label, name: to, remoteName: to });
      }
    }
  }

  async remove(userId: UserId, mailbox: Mailbox): Promise<ThreadId[]> {
    const label = await this.deps.labels.findByRemoteName(mailbox.accountId, 'gmail', mailbox.path);
    if (label === null) {
      return [];
    }
    const threadIds = await this.labelled(userId, label);
    await this.deps.labels.delete(userId, label.id);
    return threadIds;
  }

  private async labelled(userId: UserId, label: Label): Promise<ThreadId[]> {
    const threadIds: ThreadId[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.deps.threads.queryFolder(userId, {
        view: 'label',
        accountId: label.accountId,
        labelId: label.id,
        splitId: null,
        mailboxId: null,
        search: null,
        cursor,
        limit: PAGE_SIZE,
      });
      threadIds.push(...page.items.map((thread) => thread.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    return threadIds;
  }
}
