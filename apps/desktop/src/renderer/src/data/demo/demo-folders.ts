import type {
  AccountId,
  CreateFolderBody,
  Mailbox,
  MailboxId,
  RealtimeEvent,
  ThreadSummary,
  UpdateFolderBody,
} from '@relay/shared';
import { MailboxIdSchema } from '@relay/shared';
import type { FolderManager } from '../MailClient';
import { dropDemoLabel, relabelDemoTree, trashDemoFolder } from './demo-folder-effects';
import {
  assertDemoEditable,
  demoFolderName,
  demoFolderPath,
  folderError,
  inTree,
  parentPathOf,
} from './demo-folder-paths';
import { demoMailboxesOf } from './demo-mailboxes';
import type { DemoState } from './demo-state';
import { demoIds } from './seed/ids';

type Emit = (event: RealtimeEvent) => void;

const settle = <T>(work: () => T): Promise<T> => {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

class DemoFolders {
  private created = 0;

  constructor(
    private readonly state: DemoState,
    private readonly now: () => Date,
    private readonly emit: Emit,
  ) {}

  create(accountId: AccountId, body: CreateFolderBody): Mailbox {
    const parent = body.parentId === null ? null : this.editable(body.parentId);
    const siblings = this.of(accountId);
    const delimiter = parent?.delimiter ?? siblings[0]?.delimiter ?? '/';
    const name = demoFolderName(body.name, delimiter);
    const path = demoFolderPath(name, parent?.path ?? null, siblings, delimiter);
    this.created += 1;
    const key = `new-${String(this.created)}`;
    const role = siblings.some((mailbox) => mailbox.role === 'label') ? 'label' : 'custom';
    const mailbox: Mailbox = {
      id: MailboxIdSchema.parse(`mbx-${key}`),
      accountId,
      name,
      path,
      delimiter,
      role,
      subscribed: true,
      uidValidity: 5000 + this.created,
      unreadCount: 0,
      totalCount: 0,
    };
    this.state.mailboxes = [...this.state.mailboxes, mailbox];
    if (role === 'label') {
      const label = {
        id: demoIds.label(key),
        accountId,
        name: path,
        color: null,
        remoteName: path,
      };
      this.state.labels = [...this.state.labels, { ...label, kind: 'gmail' }];
    }
    this.announce(accountId, []);
    return mailbox;
  }

  update(mailboxId: MailboxId, patch: UpdateFolderBody): Mailbox {
    const mailbox = this.editable(mailboxId);
    const parent = patch.parentId ? this.editable(patch.parentId) : null;
    if (parent !== null && inTree(mailbox, parent.path)) {
      throw folderError('validation_failed', 'Priečinok nie je možné presunúť do seba.');
    }
    const parentPath =
      patch.parentId === undefined ? parentPathOf(mailbox) : (parent?.path ?? null);
    const delimiter = mailbox.delimiter ?? '/';
    const name = demoFolderName(patch.name ?? mailbox.name, delimiter);
    const others = this.of(mailbox.accountId).filter((candidate) => candidate.id !== mailbox.id);
    const path = demoFolderPath(name, parentPath, others, delimiter);
    relabelDemoTree(this.state, mailbox.path, path, mailbox);
    this.state.mailboxes = this.state.mailboxes.map((candidate) =>
      candidate.accountId === mailbox.accountId && inTree(mailbox, candidate.path)
        ? {
            ...candidate,
            path: `${path}${candidate.path.slice(mailbox.path.length)}`,
            name: candidate.id === mailbox.id ? name : candidate.name,
          }
        : candidate,
    );
    this.announce(mailbox.accountId, []);
    return this.editable(mailboxId);
  }

  remove(mailboxId: MailboxId): void {
    const mailbox = this.editable(mailboxId);
    const nested = this.of(mailbox.accountId).some(
      (candidate) => candidate.id !== mailbox.id && inTree(mailbox, candidate.path),
    );
    if (mailbox.role === 'custom' && nested) {
      throw folderError(
        'conflict',
        'Priečinok obsahuje podpriečinky. Najprv ich presuň alebo zmaž.',
      );
    }
    const changed =
      mailbox.role === 'label'
        ? dropDemoLabel(this.state, mailbox)
        : trashDemoFolder(this.state, mailbox);
    this.state.mailboxes = this.state.mailboxes.filter((candidate) => candidate.id !== mailbox.id);
    this.announce(mailbox.accountId, changed);
  }

  private of(accountId: AccountId): Mailbox[] {
    return this.state.mailboxes.filter((mailbox) => mailbox.accountId === accountId);
  }

  private editable(mailboxId: MailboxId): Mailbox {
    const mailbox = this.state.mailboxes.find((candidate) => candidate.id === mailboxId);
    if (mailbox === undefined) {
      throw folderError('validation_failed', 'Priečinok neexistuje');
    }
    assertDemoEditable(mailbox);
    return mailbox;
  }

  private announce(accountId: AccountId, threads: readonly ThreadSummary[]): void {
    const at = this.now().toISOString();
    const mailboxes = demoMailboxesOf(this.state, accountId);
    const labels = this.state.labels.filter((label) => label.accountId === accountId);
    this.emit({ type: 'mailboxes.updated', at, data: { accountId, mailboxes } });
    this.emit({ type: 'labels.updated', at, data: { accountId, labels } });
    threads.forEach((thread) => {
      this.emit({ type: 'thread.upserted', at, data: { thread } });
    });
  }
}

export const createDemoFolders = (state: DemoState, now: () => Date, emit: Emit): FolderManager => {
  const folders = new DemoFolders(state, now, emit);
  return {
    createFolder: (accountId, body) => settle(() => folders.create(accountId, body)),
    updateFolder: (mailboxId, patch) => settle(() => folders.update(mailboxId, patch)),
    deleteFolder: (mailboxId) =>
      settle(() => {
        folders.remove(mailboxId);
      }),
  };
};
