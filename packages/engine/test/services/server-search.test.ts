import { describe, expect, it } from 'vitest';
import { deliverMail, present } from '../support/fixtures';
import { backfillUntilDone, historyDate, storedMessages } from '../support/history';
import {
  gateTextSearch,
  searchServer,
  setupServerSearch,
  subjectsOf,
} from '../support/server-search';
import { USER_ID } from '../support/test-engine';

describe('ServerSearchService', () => {
  it('stores an unknown old hit as a header-only row and returns its thread', async () => {
    const { engine, seeded } = await setupServerSearch();
    const before = storedMessages(engine).length;

    const response = await searchServer(engine, 'faktúru kôň');

    expect(response.status).toBe('ok');
    expect(subjectsOf(response)).toEqual(['Ročné vyúčtovanie']);
    expect(storedMessages(engine)).toHaveLength(before + 1);
    const hit = present(response.hits[0]);
    const stored = engine.db.tables.messages.get(hit.messageId);
    expect(stored).toMatchObject({ bodyState: 'remote', textBody: null });
    expect(hit.date).toBe(stored?.date);
    const detail = await engine.services.threads.getDetail(USER_ID, hit.thread.id);
    expect(detail.messages.map((message) => message.id)).toEqual([hit.messageId]);
    await expect(engine.services.bodies.get(USER_ID, hit.messageId)).resolves.toEqual({
      status: 'ok',
      textBody: 'V prílohe posielam faktúru za kôň a voz.',
      htmlBody: null,
    });
    expect(seeded.server.textSearches.map(({ path }) => path)).toEqual([
      'INBOX',
      'Archive',
      'Sent',
    ]);
    expect(engine.events.ofType('threads.changed')).toMatchObject([
      { data: { accountId: seeded.account.id, count: 1 } },
    ]);
  });

  it('returns known rows without fetching and keeps one hit per thread, newest first', async () => {
    const { engine, seeded } = await setupServerSearch({
      seed: ({ server }) => {
        deliverMail(server, 'Archive', {
          id: 'old-invoice-reply',
          subject: 'Re: Ročné vyúčtovanie',
          inReplyTo: 'old-invoice',
          references: ['old-invoice'],
          date: historyDate(11, 100),
          body: 'Ďakujem za faktúru.',
        });
      },
    });

    const first = await searchServer(engine, 'faktúru');
    const summaries = seeded.server.textSearches.length;
    const fetched = storedMessages(engine).length;
    const second = await searchServer(engine, 'faktúru');

    expect(subjectsOf(first)).toEqual(['Nová faktúra', 'Ročné vyúčtovanie']);
    expect(first.hits[1]?.date).toBe(historyDate(11, 100));
    expect(second.hits).toEqual(first.hits);
    expect(storedMessages(engine)).toHaveLength(fetched);
    expect(seeded.server.textSearches.length).toBe(summaries * 2);
  });

  it('answers partial with the hits found before the deadline', async () => {
    const { engine, seeded } = await setupServerSearch();
    const gate = gateTextSearch(seeded, 'Sent');

    const pending = searchServer(engine, 'faktúru');
    await gate.reached;
    await engine.timer.fire();
    const response = await pending;
    gate.release();

    expect(response.status).toBe('partial');
    expect(subjectsOf(response)).toEqual(['Nová faktúra', 'Ročné vyúčtovanie']);
  });

  it('reports offline when the mail server cannot be reached', async () => {
    const { engine, seeded } = await setupServerSearch();
    seeded.server.failConnect = 'connect ECONNREFUSED';

    await expect(searchServer(engine, 'faktúru')).resolves.toMatchObject({
      status: 'offline',
      hits: [],
    });
  });

  it('skips the server once history is complete and local search covers the query', async () => {
    let cutoff: Date | null = null;
    const { engine, seeded } = await setupServerSearch({
      offlineWindow: { cutoff: () => Promise.resolve(cutoff) },
    });
    await backfillUntilDone(engine, seeded.account.id);

    const field = await searchServer(engine, 'faktúru', { searchField: 'from' });
    const keepAll = await searchServer(engine, 'faktúru');
    cutoff = new Date('2026-05-15T00:00:00.000Z');
    const windowed = await searchServer(engine, 'faktúru');

    expect(field).toMatchObject({ status: 'skipped', hits: [] });
    expect(keepAll).toMatchObject({ status: 'skipped', hits: [] });
    expect(windowed.status).toBe('ok');
    expect(seeded.server.textSearches.map(({ query }) => query.before)).toEqual([
      cutoff,
      cutoff,
      cutoff,
    ]);
  });

  it('drops the answer of a search that a newer one replaced', async () => {
    const { engine, seeded } = await setupServerSearch();
    const gate = gateTextSearch(seeded, 'INBOX');

    const stale = searchServer(engine, 'faktúru');
    await gate.reached;
    const current = searchServer(engine, 'obed');
    gate.release();

    await expect(stale).resolves.toMatchObject({ status: 'skipped', hits: [] });
    expect(subjectsOf(await current)).toEqual(['Obed']);
    expect(
      seeded.server.textSearches.filter(({ query }) => query.terms[0] === 'faktúru'),
    ).toHaveLength(1);
  });

  it('applies the unread and attachment filters and hides trashed threads', async () => {
    const { engine } = await setupServerSearch({
      seed: ({ server }) => {
        deliverMail(server, 'Archive', {
          id: 'old-read',
          subject: 'Prečítaná faktúra',
          date: historyDate(30, 100),
          body: 'faktúru',
          seen: true,
        });
      },
    });
    const all = await searchServer(engine, 'faktúru');
    const unread = await searchServer(engine, 'faktúru', { unread: true });
    const attachments = await searchServer(engine, 'faktúru', { hasAttachment: true });
    const trashed = present(all.hits.find((hit) => hit.thread.subject === 'Nová faktúra'));
    await engine.services.actions.apply(USER_ID, trashed.thread.id, { type: 'trash' });
    const afterTrash = await searchServer(engine, 'faktúru');

    expect(subjectsOf(all)).toEqual(['Nová faktúra', 'Prečítaná faktúra', 'Ročné vyúčtovanie']);
    expect(subjectsOf(unread)).toEqual(['Nová faktúra', 'Ročné vyúčtovanie']);
    expect(attachments.hits).toEqual([]);
    expect(subjectsOf(afterTrash)).toEqual(['Prečítaná faktúra', 'Ročné vyúčtovanie']);
  });

  it('leaves mail newer than the last sync to the sync', async () => {
    const { engine, seeded } = await setupServerSearch();
    deliverMail(seeded.server, 'INBOX', { id: 'brand-new', subject: 'Úplne nová faktúra' });
    const before = storedMessages(engine).length;

    const response = await searchServer(engine, 'faktúru');

    expect(subjectsOf(response)).toEqual(['Nová faktúra', 'Ročné vyúčtovanie']);
    expect(storedMessages(engine)).toHaveLength(before + 1);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const synced = storedMessages(engine).find(
      (message) => message.subject === 'Úplne nová faktúra',
    );
    expect(synced?.bodyState).toBeUndefined();
  });

  it('stores hits only after a running sync of the account finished', async () => {
    const { engine, seeded } = await setupServerSearch();
    let releaseSync: () => void = () => undefined;
    seeded.server.afterNextList = () =>
      new Promise<void>((resolve) => {
        releaseSync = resolve;
      });
    const sync = engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const before = storedMessages(engine).length;

    const search = searchServer(engine, 'faktúru kôň');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(storedMessages(engine)).toHaveLength(before);
    releaseSync();
    await sync;
    const response = await search;

    expect(subjectsOf(response)).toEqual(['Ročné vyúčtovanie']);
    expect(storedMessages(engine)).toHaveLength(before + 1);
  });
});
