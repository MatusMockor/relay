import { describe, expect, it } from 'vitest';
import { MAX_SUBSCRIPTIONS_PER_USER } from '../../src/services/calendar/subscription-service';
import { calendarOf, eventData } from '../support/calendar-fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const URL = 'https://calendar.example.test/private-secret/basic.ics';

const create = (engine: TestEngine, url = URL) =>
  engine.services.calendar.createSubscription(USER_ID, { name: 'Rodina', url, color: '#22aa66' });

const serve = (engine: TestEngine, url: string, body: string) => {
  engine.calendar.feedFetcher.feeds.set(url, {
    kind: 'fetched',
    body,
    etag: null,
    lastModified: null,
  });
};

const expectNothingSaved = async (engine: TestEngine) => {
  expect(await engine.services.calendar.listSubscriptions(USER_ID)).toEqual([]);
  expect(engine.calendar.feedSecrets.urls.size).toBe(0);
};

describe('Calendar subscription validation on add', () => {
  it('rejects a feed whose server answers with an error and saves nothing', async () => {
    const engine = createTestEngine();
    engine.calendar.feedFetcher.feeds.set(URL, new Error('Server kalendára vrátil stav 404.'));

    await expect(create(engine)).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Kalendár sa nepodarilo pridať. Server kalendára vrátil stav 404.',
    });
    await expectNothingSaved(engine);
  });

  it('rejects a response that is not iCalendar', async () => {
    const engine = createTestEngine();
    serve(engine, URL, '<html>Prihlásenie</html>');

    await expect(create(engine)).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Kalendár sa nepodarilo pridať. Súbor nie je platný iCalendar.',
    });
    await expectNothingSaved(engine);
  });

  it('fetches a valid feed only once when adding it and does not treat it as due', async () => {
    const engine = createTestEngine();
    engine.calendar.parser.register('feed-v1', calendarOf('PUBLISH', eventData({ uid: 'f1' })));
    serve(engine, URL, 'feed-v1');
    const secrets = engine.calendar.feedSecrets;
    const storeSecret = secrets.set.bind(secrets);
    let dueWhileCreating: number | null = null;
    secrets.set = async (subscriptionId, url) => {
      dueWhileCreating = await engine.services.calendar.refreshDueSubscriptions();
      return storeSecret(subscriptionId, url);
    };

    const subscription = await create(engine);

    expect(dueWhileCreating).toBe(0);
    expect(subscription).toMatchObject({ status: 'ok', eventCount: 1 });
    expect(engine.calendar.feedFetcher.requests).toHaveLength(1);
  });

  it('explains the https rule and the subscription limit in Slovak', async () => {
    const engine = createTestEngine();
    await expect(create(engine, 'http://calendar.example.test/a.ics')).rejects.toMatchObject({
      message: 'Adresa kalendára musí používať https.',
    });
    engine.calendar.parser.register('feed', calendarOf('PUBLISH', eventData({ uid: 'f1' })));
    for (let index = 0; index < MAX_SUBSCRIPTIONS_PER_USER; index += 1) {
      const url = `https://calendar.example.test/${String(index)}.ics`;
      serve(engine, url, 'feed');
      await create(engine, url);
    }

    await expect(create(engine, 'https://calendar.example.test/extra.ics')).rejects.toMatchObject({
      message: `Môžeš mať najviac ${String(MAX_SUBSCRIPTIONS_PER_USER)} odoberaných kalendárov.`,
    });
  });
});
