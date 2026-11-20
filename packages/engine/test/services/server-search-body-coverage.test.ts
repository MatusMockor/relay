import { describe, expect, it } from 'vitest';
import { deliverMail } from '../support/fixtures';
import { backfillUntilDone, storedMessages } from '../support/history';
import { isRemote, SwitchableWindow } from '../support/offline-window';
import { searchServer, setupServerSearch, subjectsOf } from '../support/server-search';
import { TEST_NOW, type TestEngine } from '../support/test-engine';

const DAY_MS = 24 * 60 * 60_000;
const FOUR_MONTHS_AGO = new Date(Date.parse(TEST_NOW) - 120 * DAY_MS).toISOString();

const expectedBound = (engine: TestEngine): Date => {
  const newest = Math.max(
    ...storedMessages(engine)
      .filter(isRemote)
      .map((message) => Date.parse(message.date)),
  );
  return new Date(Math.floor(newest / DAY_MS) * DAY_MS + 2 * DAY_MS);
};

const setupWindowed = async (window: SwitchableWindow) => {
  const setup = await setupServerSearch({
    offlineWindow: window,
    offlineBodies: true,
    seed: ({ server }) => {
      deliverMail(server, 'Archive', {
        id: 'budget',
        subject: 'Plán na jar',
        date: FOUR_MONTHS_AGO,
        body: 'Prikladám rozpočet na jar.',
      });
    },
  });
  await backfillUntilDone(setup.engine, setup.seeded.account.id);
  return setup;
};

describe('server search body coverage', () => {
  it('searches the server for bodies still remote after the window grows to all', async () => {
    const window = new SwitchableWindow('3m');
    const { engine, seeded } = await setupWindowed(window);
    window.set('all');

    const field = await searchServer(engine, 'faktúru', { searchField: 'subject' });
    const whole = await searchServer(engine, 'faktúru');

    expect(field).toMatchObject({ status: 'skipped', hits: [] });
    expect(whole.status).toBe('ok');
    expect(subjectsOf(whole)).toEqual(['Ročné vyúčtovanie']);
    const bound = expectedBound(engine);
    expect(seeded.server.textSearches.map(({ query }) => query.before)).toEqual([
      bound,
      bound,
      bound,
    ]);
  });

  it('includes remote bodies of the interval a finite expansion newly covers', async () => {
    const window = new SwitchableWindow('3m');
    const { engine } = await setupWindowed(window);
    window.set('6m');

    const response = await searchServer(engine, 'rozpočet');

    expect(response.status).toBe('ok');
    expect(subjectsOf(response)).toEqual(['Plán na jar']);
    expect(expectedBound(engine).getTime()).toBeGreaterThan(Date.parse(FOUR_MONTHS_AGO));
  });

  it('skips the server once every stored body is local', async () => {
    const { engine, seeded } = await setupWindowed(new SwitchableWindow('all'));
    expect(storedMessages(engine).filter(isRemote)).toEqual([]);

    const field = await searchServer(engine, 'faktúru', { searchField: 'from' });
    const whole = await searchServer(engine, 'rozpočet');

    expect(field).toMatchObject({ status: 'skipped', hits: [] });
    expect(whole).toMatchObject({ status: 'skipped', hits: [] });
    expect(seeded.server.textSearches).toEqual([]);
  });
});
