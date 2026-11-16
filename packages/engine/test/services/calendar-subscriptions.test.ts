import { describe, expect, it } from 'vitest';
import { calendarOf, DAY_WINDOW, eventData } from '../support/calendar-fixtures';
import { present } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const URL = 'https://calendar.example.test/private-secret/basic.ics';

const subscribe = async (engine: TestEngine) => {
  engine.calendar.parser.register('feed-v1', calendarOf('PUBLISH', eventData({ uid: 'f1' })));
  engine.calendar.feedFetcher.feeds.set(URL, {
    kind: 'fetched',
    body: 'feed-v1',
    etag: '"v1"',
    lastModified: null,
  });
  return engine.services.calendar.createSubscription(USER_ID, {
    name: 'Rodina',
    url: URL,
    color: '#22aa66',
  });
};

describe('Calendar subscriptions', () => {
  it('stores the URL as a secret, fetches the feed and lists its events', async () => {
    const engine = createTestEngine();
    const subscription = await subscribe(engine);

    expect(subscription).toMatchObject({
      name: 'Rodina',
      host: 'calendar.example.test',
      status: 'ok',
      eventCount: 1,
    });
    expect(JSON.stringify(subscription)).not.toContain('private-secret');
    expect(engine.calendar.feedSecrets.urls.get(subscription.id)).toBe(URL);
    const [occurrence] = await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW);
    expect(occurrence).toMatchObject({
      sourceKind: 'subscription',
      subscriptionId: subscription.id,
      color: '#22aa66',
      threadId: null,
    });
  });

  it('sends the ETag back and keeps events when the feed is unchanged', async () => {
    const engine = createTestEngine();
    const subscription = await subscribe(engine);
    engine.calendar.feedFetcher.feeds.set(URL, { kind: 'not-modified' });

    const refreshed = await engine.services.calendar.refreshSubscription(USER_ID, subscription.id);

    expect(engine.calendar.feedFetcher.requests.at(-1)?.etag).toBe('"v1"');
    expect(refreshed).toMatchObject({ status: 'ok', eventCount: 1 });
    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toHaveLength(1);
  });

  it('records fetch errors without dropping the previous events', async () => {
    const engine = createTestEngine();
    const subscription = await subscribe(engine);
    engine.calendar.feedFetcher.feeds.set(URL, new Error('Vypršal časový limit.'));

    const refreshed = await engine.services.calendar.refreshSubscription(USER_ID, subscription.id);

    expect(refreshed).toMatchObject({ status: 'error', lastError: 'Vypršal časový limit.' });
    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toHaveLength(1);
  });

  it('refreshes only due subscriptions on the periodic tick', async () => {
    const engine = createTestEngine();
    await subscribe(engine);
    const before = engine.calendar.feedFetcher.requests.length;

    expect(await engine.services.calendar.refreshDueSubscriptions()).toBe(0);
    engine.clock.advance(16 * 60 * 1000);
    expect(await engine.services.calendar.refreshDueSubscriptions()).toBe(1);
    expect(engine.calendar.feedFetcher.requests.length).toBe(before + 1);
  });

  it('deletes the subscription, its events and the stored URL', async () => {
    const engine = createTestEngine();
    const subscription = await subscribe(engine);

    await engine.services.calendar.deleteSubscription(USER_ID, subscription.id);

    expect(await engine.services.calendar.listSubscriptions(USER_ID)).toEqual([]);
    expect(engine.db.tables.calendarEvents.size).toBe(0);
    expect(engine.calendar.feedSecrets.urls.size).toBe(0);
    await expect(
      engine.services.calendar.refreshSubscription(USER_ID, present(subscription).id),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('updates the name and color', async () => {
    const engine = createTestEngine();
    const subscription = await subscribe(engine);

    const updated = await engine.services.calendar.updateSubscription(USER_ID, subscription.id, {
      color: '#ff0000',
    });

    expect(updated).toMatchObject({ name: 'Rodina', color: '#ff0000' });
  });
});
