import type { ThreadFolderQuery } from '@relay/engine';
import type { Label, Mailbox, ThreadSummary } from '@relay/shared/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  at,
  buildMailbox,
  buildMessage,
  newId,
  seedAccount,
  seedThread,
  type SeededAccount,
} from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const query = (overrides: Partial<ThreadFolderQuery>): ThreadFolderQuery => ({
  view: 'inbox',
  accountId: null,
  splitId: null,
  labelId: null,
  mailboxId: null,
  search: null,
  cursor: null,
  limit: 50,
  ...overrides,
});

describe('PgThreadRepository.queryFolder for folders and labels', () => {
  const context = usePgTestContext();
  let work: SeededAccount;
  let folder: Mailbox;
  let label: Label;

  const subjects = async (overrides: Partial<ThreadFolderQuery>): Promise<string[]> =>
    (await context.repositories.threads.queryFolder(work.user.id, query(overrides))).items.map(
      (thread) => thread.subject,
    );

  const seedIn = (
    mailbox: Mailbox,
    subject: string,
    minute: number,
    overrides: Partial<ThreadSummary> = {},
    labelled = false,
  ) =>
    seedThread(
      context.repositories,
      { ...work, mailboxes: { ...work.mailboxes, inbox: mailbox } },
      { subject, lastMessageAt: at(minute), ...overrides },
      { labelIds: labelled ? [label.id] : [] },
    );

  beforeAll(async () => {
    work = await seedAccount(context.repositories);
    const [stored] = await context.repositories.mailboxes.upsertMany(work.account.id, [
      buildMailbox(work.account.id, 'custom', { path: 'Projekty', name: 'Projekty' }),
    ]);
    folder = stored ?? work.mailboxes.inbox;
    label = {
      id: newId('label'),
      accountId: work.account.id,
      name: 'Projekty/Alfa',
      color: null,
      kind: 'gmail',
      remoteName: 'Projekty/Alfa',
    };
    await context.repositories.labels.upsert(label);
    const many = await seedIn(folder, 'V priečinku', 5, { state: 'done' });
    await context.repositories.messages.upsert(
      buildMessage(many.thread, folder, { subject: 'Druhá správa' }),
      new Map(),
    );
    await seedIn(work.mailboxes.inbox, 'V doručenej', 4, {}, true);
    await seedIn(folder, 'V koši', 3, { state: 'trash' }, true);
    await seedIn(folder, 'V spame', 2, { state: 'spam' });
    await seedIn(work.mailboxes.inbox, 'Archivované so štítkom', 1, { state: 'done' }, true);
  });

  it('lists threads with a message in the mailbox once and leaves out held threads', async () => {
    expect(folder.role).toBe('custom');
    await expect(subjects({ view: 'mailbox', mailboxId: folder.id })).resolves.toEqual([
      'V priečinku',
    ]);
    await expect(
      subjects({ view: 'mailbox', mailboxId: work.mailboxes.inbox.id }),
    ).resolves.toEqual(['V doručenej', 'Archivované so štítkom']);
  });

  it('lists labelled threads outside the inbox and leaves out held threads', async () => {
    await expect(subjects({ view: 'label', labelId: label.id })).resolves.toEqual([
      'V doručenej',
      'Archivované so štítkom',
    ]);
  });
});
