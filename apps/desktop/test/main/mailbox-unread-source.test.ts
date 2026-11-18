import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { totalUnread } from '../../src/main/native/account-overview';
import { MailboxUnreadSource } from '../../src/main/native/mailbox-unread-source';
import {
  openSqliteMailStore,
  type SqliteMailStore,
  storeMailbox,
  storedAccount,
} from './support/sqlite-mail-store';

describe('MailboxUnreadSource', () => {
  let store: SqliteMailStore;

  beforeEach(() => {
    store = openSqliteMailStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('reports the inbox unread count, sync state and identity of every account', async () => {
    const work = await store.repositories.accounts.create(
      storedAccount('work', { lastSyncedAt: '2026-11-15T07:58:00.000Z' }),
    );
    const home = await store.repositories.accounts.create(
      storedAccount('home', { displayName: 'Domov', color: '#ef6b6b', status: 'error' }),
    );
    await storeMailbox(store, work, 'inbox', 4);
    await storeMailbox(store, work, 'spam', 30);
    await storeMailbox(store, home, 'inbox', 2);

    const overviews = await new MailboxUnreadSource(store.repositories, LOCAL_USER_ID).load();

    expect([...overviews].sort((left, right) => left.id.localeCompare(right.id))).toEqual([
      {
        id: home.id,
        displayName: 'Domov',
        email: 'home@firma.sk',
        color: '#ef6b6b',
        status: 'error',
        lastSyncedAt: null,
        unread: 2,
      },
      {
        id: work.id,
        displayName: 'Práca',
        email: 'work@firma.sk',
        color: '#4f6ef7',
        status: 'connected',
        lastSyncedAt: '2026-11-15T07:58:00.000Z',
        unread: 4,
      },
    ]);
    expect(totalUnread(overviews)).toBe(6);
  });

  it('counts an account without an inbox yet as having nothing unread', async () => {
    await store.repositories.accounts.create(storedAccount('fresh'));
    const overviews = await new MailboxUnreadSource(store.repositories, LOCAL_USER_ID).load();
    expect(overviews.map((overview) => overview.unread)).toEqual([0]);
  });
});
