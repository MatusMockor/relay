import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FEED_CA_FILE, type FeedServer, startFeedServer } from './support/feed-server';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { createTempDir, type TempDir } from './support/temp-dir';

const FEED_PATH = '/calendar/ical/private-desktop-77/basic.ics';
const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Relay test//SK',
  'BEGIN:VEVENT',
  'UID:feed-1@relay.test',
  'DTSTAMP:20261114T120000Z',
  'DTSTART:20261116T110000Z',
  'DTEND:20261116T120000Z',
  'SUMMARY:Obed s rodinou',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

describe('local mode calendar feeds', () => {
  let dir: TempDir;
  let feed: FeedServer;
  let harness: LocalRuntimeHarness;
  let feedGone = false;

  beforeEach(async () => {
    dir = await createTempDir();
    feedGone = false;
    feed = await startFeedServer((request, response) => {
      if (request.url === FEED_PATH && !feedGone) {
        response.writeHead(200, { 'content-type': 'text/calendar' }).end(FEED);
        return;
      }
      response.writeHead(404).end();
    });
  });

  afterEach(async () => {
    await harness.close();
    await feed.close();
    await dir.remove();
  });

  const subscribe = (url: string) =>
    harness.bridge.invoke('local.calendar.subscriptions.create', {
      name: 'Práca',
      url,
      color: '#4f6ef7',
    });

  it('rejects a feed in a private network without saving it', async () => {
    harness = startLocalRuntime(dir);
    const url = `${feed.origin}${FEED_PATH}`;

    const rejected = await subscribe(url);

    expect(rejected).toMatchObject({
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Kalendár sa nepodarilo pridať. Adresa kalendára smeruje do súkromnej siete.',
      },
    });
    expect(expectOk(await harness.bridge.invoke('local.calendar.subscriptions.list'))).toEqual([]);
  });

  it('rejects a 404 feed, keeps a saved feed that fails later and its URL secret', async () => {
    harness = startLocalRuntime(dir, {
      env: {
        RELAY_CALENDAR_FEEDS_ALLOW_PRIVATE_NETWORKS: 'true',
        RELAY_CALENDAR_FEEDS_CA_FILE: FEED_CA_FILE,
      },
    });
    const { bridge } = harness;

    const missing = await subscribe(`${feed.origin}/calendar/missing.ics`);
    const created = expectOk(await subscribe(`${feed.origin}${FEED_PATH}`));
    feedGone = true;
    const failed = expectOk(
      await bridge.invoke('local.calendar.subscriptions.refresh', { subscriptionId: created.id }),
    );

    expect(missing).toMatchObject({
      ok: false,
      error: { message: 'Kalendár sa nepodarilo pridať. Server kalendára vrátil stav 404.' },
    });
    expect(created).toMatchObject({ status: 'ok', eventCount: 1, host: '127.0.0.1' });
    expect(failed).toMatchObject({
      status: 'error',
      lastError: 'Server kalendára vrátil stav 404.',
      eventCount: 1,
    });
    const listed = expectOk(await bridge.invoke('local.calendar.subscriptions.list'));
    expect(listed.map((subscription) => subscription.id)).toEqual([created.id]);
    expect(JSON.stringify(listed)).not.toContain('private-desktop-77');
    const secrets = await readFile(harness.runtime.infrastructure.paths.secrets, 'utf8');
    expect(secrets).not.toContain('private-desktop-77');
    expectOk(
      await bridge.invoke('local.calendar.subscriptions.delete', { subscriptionId: created.id }),
    );
    expect(await harness.runtime.infrastructure.calendarFeeds.get(created.id)).toBeNull();
  });
});
