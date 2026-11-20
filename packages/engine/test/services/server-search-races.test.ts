import { describe, expect, it } from 'vitest';
import type { TestEngine } from '../support/test-engine';
import { deliverMail, present } from '../support/fixtures';
import { storedMessages } from '../support/history';
import {
  gateTextSearch,
  searchServer,
  setupServerSearch,
  subjectsOf,
} from '../support/server-search';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const storedBySubject = (engine: TestEngine, subject: string) =>
  present(storedMessages(engine).find((message) => message.subject === subject));

const termsSearched = (searches: readonly { query: { terms: readonly string[] } }[]) =>
  searches.map(({ query }) => query.terms.join(' '));

describe('ServerSearchService races', () => {
  it('skips a superseded search that waited for the account session', async () => {
    const { engine, seeded } = await setupServerSearch();
    const gate = gateTextSearch(seeded, 'INBOX');

    const first = searchServer(engine, 'faktúru');
    await gate.reached;
    const queued = searchServer(engine, 'kôň');
    await settle();
    const current = searchServer(engine, 'obed');
    await settle();
    gate.release();

    await expect(first).resolves.toMatchObject({ status: 'skipped', hits: [] });
    await expect(queued).resolves.toMatchObject({ status: 'skipped', hits: [] });
    expect(subjectsOf(await current)).toEqual(['Obed']);
    expect(termsSearched(seeded.server.textSearches)).not.toContain('kôň');
  });

  it('skips a search whose deadline passed while it waited for the account session', async () => {
    const { engine, seeded } = await setupServerSearch();
    const gate = gateTextSearch(seeded, 'INBOX');

    const first = searchServer(engine, 'faktúru');
    await gate.reached;
    const queued = searchServer(engine, 'kôň');
    await settle();
    await engine.timer.fire();
    const answer = await queued;
    gate.release();
    await first;
    await settle();

    expect(answer).toMatchObject({ status: 'partial', hits: [] });
    expect(termsSearched(seeded.server.textSearches)).not.toContain('kôň');
  });

  it('does not map found UIDs to rows stored under a newer UIDVALIDITY', async () => {
    const { engine, seeded } = await setupServerSearch({
      seed: ({ server }) => {
        deliverMail(server, 'INBOX', {
          id: 'lunch-invite',
          subject: 'Pozvánka na obed',
          body: 'Príď o dvanástej.',
        });
      },
    });
    const invoice = storedBySubject(engine, 'Nová faktúra');
    const invite = storedBySubject(engine, 'Pozvánka na obed');
    seeded.server.beforeTextSearch = (path) => {
      if (path !== 'INBOX') {
        return Promise.resolve();
      }
      seeded.server.beforeTextSearch = null;
      const state = present(engine.db.tables.syncStates.get(invoice.mailboxId));
      engine.db.tables.syncStates.set(invoice.mailboxId, {
        ...state,
        uidValidity: state.uidValidity + 1,
      });
      engine.db.tables.messages.set(invoice.id, { ...invoice, uid: invite.uid });
      engine.db.tables.messages.set(invite.id, { ...invite, uid: invoice.uid });
      return Promise.resolve();
    };

    const response = await searchServer(engine, 'faktúru');

    expect(response.status).toBe('partial');
    expect(subjectsOf(response)).toEqual(['Ročné vyúčtovanie']);
  });
});
