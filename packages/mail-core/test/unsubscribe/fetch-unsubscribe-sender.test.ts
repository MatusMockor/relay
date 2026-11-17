import { ProviderError, ValidationError } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { FetchUnsubscribeSender, type UnsubscribeFetch } from '../../src';

const PUBLIC = () => Promise.resolve(['93.184.216.34']);

interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

const stubFetch = (status: number) => {
  const requests: RecordedRequest[] = [];
  const fetch: UnsubscribeFetch = (url, init) => {
    requests.push({ url, init });
    return Promise.resolve(new Response(null, { status }));
  };
  return { fetch, requests };
};

describe('FetchUnsubscribeSender', () => {
  it('posts the RFC 8058 one-click body without following redirects', async () => {
    const stub = stubFetch(200);

    await new FetchUnsubscribeSender({ fetch: stub.fetch, resolver: PUBLIC }).sendOneClick(
      'https://news.example.com/u/1',
    );

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]?.url).toBe('https://news.example.com/u/1');
    expect(stub.requests[0]?.init).toMatchObject({
      method: 'POST',
      body: 'List-Unsubscribe=One-Click',
      redirect: 'manual',
      credentials: 'omit',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
  });

  it('refuses non-public or non-https targets before any request', async () => {
    const stub = stubFetch(200);
    const sender = new FetchUnsubscribeSender({ fetch: stub.fetch, resolver: PUBLIC });

    for (const url of [
      'http://news.example.com/u',
      'https://127.0.0.1/u',
      'https://localhost/u',
      'https://user:secret@news.example.com/u',
    ]) {
      await expect(sender.sendOneClick(url)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(stub.requests).toEqual([]);
  });

  it('refuses hosts that resolve to private, loopback or link-local addresses', async () => {
    const stub = stubFetch(200);
    for (const addresses of [
      ['10.0.0.5'],
      ['93.184.216.34', '127.0.0.1'],
      ['fe80::1'],
      ['::ffff:192.168.1.1'],
      [],
    ]) {
      const sender = new FetchUnsubscribeSender({
        fetch: stub.fetch,
        resolver: () => Promise.resolve(addresses),
      });
      await expect(sender.sendOneClick('https://news.example.com/u')).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    await expect(
      new FetchUnsubscribeSender({
        fetch: stub.fetch,
        resolver: () => Promise.reject(new Error('ENOTFOUND')),
      }).sendOneClick('https://news.example.com/u'),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(stub.requests).toEqual([]);
  });

  it('treats redirects as a failed unsubscribe', async () => {
    await expect(
      new FetchUnsubscribeSender({ fetch: stubFetch(302).fetch, resolver: PUBLIC }).sendOneClick(
        'https://news.example.com/u',
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('reports failed responses and network errors as provider errors', async () => {
    await expect(
      new FetchUnsubscribeSender({ fetch: stubFetch(500).fetch, resolver: PUBLIC }).sendOneClick(
        'https://news.example.com/u',
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    await expect(
      new FetchUnsubscribeSender({
        fetch: () => Promise.reject(new TypeError('offline')),
        resolver: PUBLIC,
      }).sendOneClick('https://news.example.com/u'),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
