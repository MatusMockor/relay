import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpsCalendarFeedFetcher } from '../src';
import { fixture } from './support/fixtures';
import { type FeedServer, startFeedServer, TEST_CA } from './support/feed-server';

const NONE = { etag: null, lastModified: null };
const SECRET = '/calendar/ical/secret-token-123/basic.ics';
const BODY = fixture('google-recurring.ics');

const message = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

describe('HttpsCalendarFeedFetcher against a local server', () => {
  let server: FeedServer;
  const fetcher = (options = {}) =>
    new HttpsCalendarFeedFetcher({ allowPrivateNetworks: true, ca: TEST_CA, ...options });

  beforeEach(async () => {
    server = await startFeedServer();
    server.route(SECRET, (request, response) => {
      if (request.headers['if-none-match'] === '"v1"') {
        response.writeHead(304).end();
        return;
      }
      response.writeHead(200, {
        'content-type': 'text/calendar; charset=utf-8',
        etag: '"v1"',
        'last-modified': 'Sun, 15 Nov 2026 08:00:00 GMT',
      });
      response.end(BODY);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('fetches the feed with validators and honours 304', async () => {
    const first = await fetcher().fetch(`${server.origin}${SECRET}`, NONE);
    expect(first).toEqual({
      kind: 'fetched',
      body: BODY,
      etag: '"v1"',
      lastModified: 'Sun, 15 Nov 2026 08:00:00 GMT',
    });
    const second = await fetcher().fetch(`${server.origin}${SECRET}`, {
      etag: '"v1"',
      lastModified: null,
    });
    expect(second).toEqual({ kind: 'not-modified' });
    expect(server.requests[1]?.headers['if-none-match']).toBe('"v1"');
  });

  it('follows redirects and re-checks every hop', async () => {
    server.route('/moved', (_request, response) => {
      response.writeHead(302, { location: SECRET }).end();
    });
    server.route('/downgrade', (_request, response) => {
      response.writeHead(301, { location: 'http://example.com/feed.ics' }).end();
    });
    server.route('/loop', (_request, response) => {
      response.writeHead(307, { location: '/loop' }).end();
    });
    expect((await fetcher().fetch(`${server.origin}/moved`, NONE)).kind).toBe('fetched');
    expect(await message(fetcher().fetch(`${server.origin}/downgrade`, NONE))).toBe(
      'Adresa kalendára musí používať https.',
    );
    expect(await message(fetcher().fetch(`${server.origin}/loop`, NONE))).toBe(
      'Server kalendára presmerúva príliš veľakrát.',
    );
  });

  it('enforces the size limit and the timeout', async () => {
    server.route('/big', (_request, response) => {
      response.writeHead(200);
      response.write('x'.repeat(4096));
      response.end('x'.repeat(4096));
    });
    server.route('/declared', (_request, response) => {
      response.writeHead(200, { 'content-length': '999999' });
      response.end('x');
    });
    server.route('/slow', () => undefined);
    const small = fetcher({ maxBytes: 5000, timeoutMs: 300 });
    expect(await message(small.fetch(`${server.origin}/big`, NONE))).toBe(
      'Kalendár je príliš veľký.',
    );
    expect(await message(small.fetch(`${server.origin}/declared`, NONE))).toBe(
      'Kalendár je príliš veľký.',
    );
    expect(await message(small.fetch(`${server.origin}/slow`, NONE))).toBe(
      'Server kalendára neodpovedal včas.',
    );
  });

  it('reports HTTP errors without leaking the secret URL', async () => {
    const error = await message(fetcher().fetch(`${server.origin}/missing-secret-token`, NONE));
    expect(error).toBe('Server kalendára vrátil stav 404.');
    expect(error).not.toContain('secret');
  });

  it('rejects an untrusted certificate', async () => {
    const strict = new HttpsCalendarFeedFetcher({ allowPrivateNetworks: true });
    expect(await message(strict.fetch(`${server.origin}${SECRET}`, NONE))).toBe(
      'Server kalendára nie je dostupný.',
    );
  });
});

describe('HttpsCalendarFeedFetcher SSRF guard', () => {
  const guarded = new HttpsCalendarFeedFetcher({ timeoutMs: 2000 });

  it.each([
    'https://127.0.0.1/feed.ics',
    'https://10.1.2.3/feed.ics',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/feed.ics',
    'https://[::ffff:127.0.0.1]/feed.ics',
    'https://[fd00::1]/feed.ics',
    'https://localhost/feed.ics',
  ])('refuses %s', async (url) => {
    expect(await message(guarded.fetch(url, NONE))).toBe(
      'Adresa kalendára smeruje do súkromnej siete.',
    );
  });

  it('refuses plain http unless explicitly allowed', async () => {
    expect(await message(guarded.fetch('http://example.com/feed.ics', NONE))).toBe(
      'Adresa kalendára musí používať https.',
    );
    expect(await message(guarded.fetch('not a url', NONE))).toBe('Adresa kalendára nie je platná.');
  });

  it('allows a plain http test server only with both flags', async () => {
    const plain = await startFeedServer(false);
    plain.route('/feed.ics', (_request, response) => {
      response.writeHead(200).end(BODY);
    });
    const insecure = new HttpsCalendarFeedFetcher({
      allowPrivateNetworks: true,
      allowInsecureHttp: true,
    });
    expect((await insecure.fetch(`${plain.origin}/feed.ics`, NONE)).kind).toBe('fetched');
    expect(await message(guarded.fetch(`${plain.origin}/feed.ics`, NONE))).toBe(
      'Adresa kalendára musí používať https.',
    );
    await plain.close();
  });
});
