import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import {
  accountId,
  buildMessage,
  messageId,
  NO_HEADERS,
  threadId,
  userId,
} from './support/fixtures';
import { addThread, folderIds } from './support/folder-scenario';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

describe('SqliteThreadRepository.queryFolder full-text search', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
    await addThread(
      store,
      work,
      't-invoice',
      { lastMessageAt: '2026-11-10T10:00:00.000Z' },
      {
        subject: 'Faktúra za október',
        from: { name: 'Jana Nováková', email: 'jana@klient.sk' },
        snippet: 'Dobrý deň',
        textBody: 'Posielam faktúru č. 2026-104 na úhradu.',
      },
    );
    await addThread(
      store,
      work,
      't-meeting',
      { lastMessageAt: '2026-11-11T10:00:00.000Z' },
      {
        subject: 'Stretnutie v piatok',
        from: { name: 'Peter Šťastný', email: 'peter@partner.sk' },
        snippet: 'Väčšia časť tímu príde',
        textBody: 'Uvidíme sa o deviatej v kancelárii.',
      },
    );
  });

  afterEach(() => {
    store.database.close();
  });

  it('matches without diacritics and case-insensitively', async () => {
    expect(await folderIds(store, { search: 'faktura' })).toEqual(['t-invoice']);
    expect(await folderIds(store, { search: 'CAST' })).toEqual(['t-meeting']);
    expect(await folderIds(store, { search: 'stastny' })).toEqual(['t-meeting']);
  });

  it('matches queries written with diacritics', async () => {
    expect(await folderIds(store, { search: 'Nováková' })).toEqual(['t-invoice']);
    expect(await folderIds(store, { search: 'úhradu' })).toEqual(['t-invoice']);
  });

  it('searches subject, sender, snippet and body with prefix terms', async () => {
    expect(await folderIds(store, { search: 'fakt' })).toEqual(['t-invoice']);
    expect(await folderIds(store, { search: 'partner.sk' })).toEqual(['t-meeting']);
    expect(await folderIds(store, { search: 'vacsia' })).toEqual(['t-meeting']);
    expect(await folderIds(store, { search: 'kancelarii' })).toEqual(['t-meeting']);
  });

  it('requires every term to match', async () => {
    expect(await folderIds(store, { search: 'faktura piatok' })).toEqual([]);
    expect(await folderIds(store, { search: 'stretnutie piatok' })).toEqual(['t-meeting']);
  });

  it('treats FTS syntax in the query as plain text', async () => {
    expect(await folderIds(store, { search: '"faktura' })).toEqual(['t-invoice']);
    expect(await folderIds(store, { search: 'faktura OR piatok' })).toEqual([]);
    expect(await folderIds(store, { search: 'faktura*' })).toEqual(['t-invoice']);
    expect(await folderIds(store, { search: '( * ) : ^' })).toEqual(['t-meeting', 't-invoice']);
    expect(await folderIds(store, { search: '   ' })).toEqual(['t-meeting', 't-invoice']);
  });

  it('combines search with the folder filters', async () => {
    await store.repositories.threads.updateState(LOCAL_USER_ID, threadId('t-invoice'), {
      state: 'done',
      remindAt: null,
    });
    expect(await folderIds(store, { search: 'faktura' })).toEqual([]);
    expect(await folderIds(store, { search: 'faktura', view: 'done' })).toEqual(['t-invoice']);
  });

  it('follows message updates and deletions', async () => {
    const { messages } = store.repositories;
    await messages.upsert(
      buildMessage({
        id: messageId('t-invoice-msg'),
        threadId: threadId('t-invoice'),
        mailboxId: work.inbox.id,
        uid: 900,
        subject: 'Dobropis',
        textBody: 'Opravný doklad',
      }),
      NO_HEADERS,
    );
    expect(await folderIds(store, { search: 'dobropis' })).toEqual(['t-invoice']);
    expect(await folderIds(store, { search: 'october' })).toEqual([]);

    await messages.deleteByUids(work.inbox.id, [900]);
    expect(await folderIds(store, { search: 'dobropis' })).toEqual([]);
  });

  it('never matches messages of another user', async () => {
    const intruder = userId('intruder');
    const foreign = await seedAccount(store.repositories, {
      id: accountId('acc-foreign'),
      userId: intruder,
      email: 'eva@ine.sk',
    });
    await addThread(store, foreign, 't-foreign', {}, { subject: 'Faktúra cudzia' });

    expect(await folderIds(store, { search: 'faktura' })).toEqual(['t-invoice']);
    const page = await store.repositories.threads.queryFolder(intruder, {
      view: 'inbox',
      accountId: null,
      splitId: null,
      labelId: null,
      search: 'faktura',
      cursor: null,
      limit: 10,
    });
    expect(page.items.map((thread) => thread.id)).toEqual(['t-foreign']);
  });
});
