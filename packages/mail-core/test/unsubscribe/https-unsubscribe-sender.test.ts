import type { LookupAddress } from 'node:dns';
import { ProviderError, ValidationError } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import {
  type HostResolver,
  HttpsUnsubscribeSender,
  type PinnedRequest,
  pinnedLookup,
  type UnsubscribeTransport,
} from '../../src';

const PUBLIC_IP = '93.184.216.34';

const stubTransport = (status: number) => {
  const requests: PinnedRequest[] = [];
  const transport: UnsubscribeTransport = (request) => {
    requests.push(request);
    return Promise.resolve(status);
  };
  return { transport, requests };
};

const countingResolver = (...answers: (readonly string[])[]) => {
  const calls: string[] = [];
  const resolver: HostResolver = (hostname) => {
    calls.push(hostname);
    return Promise.resolve(answers[Math.min(calls.length - 1, answers.length - 1)] ?? []);
  };
  return { resolver, calls };
};

const sender = (transport: UnsubscribeTransport, resolver: HostResolver) =>
  new HttpsUnsubscribeSender({ transport, resolver });

describe('HttpsUnsubscribeSender', () => {
  it('posts the RFC 8058 body to the validated public address', async () => {
    const stub = stubTransport(200);
    const { resolver } = countingResolver([PUBLIC_IP]);

    await sender(stub.transport, resolver).sendOneClick('https://news.example.com/u/1?id=7');

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]?.url.href).toBe('https://news.example.com/u/1?id=7');
    expect(stub.requests[0]).toMatchObject({
      target: { address: PUBLIC_IP, family: 4 },
      body: 'List-Unsubscribe=One-Click',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      timeoutMs: 10_000,
    });
  });

  it('resolves once and pins the connection to that address despite DNS rebinding', async () => {
    const stub = stubTransport(204);
    const { resolver, calls } = countingResolver([PUBLIC_IP], ['127.0.0.1']);

    await sender(stub.transport, resolver).sendOneClick('https://news.example.com/u');

    expect(calls).toEqual(['news.example.com']);
    const target = stub.requests[0]?.target;
    expect(target).toEqual({ address: PUBLIC_IP, family: 4 });
    const lookedUp: unknown[] = [];
    const lookup = pinnedLookup(target ?? { address: '', family: 4 });
    lookup('news.example.com', { all: true }, (error, addresses) => {
      lookedUp.push(error, addresses);
    });
    lookup('news.example.com', {}, (error, address, family) => {
      lookedUp.push(error, address, family);
    });
    expect(lookedUp).toEqual([
      null,
      [{ address: PUBLIC_IP, family: 4 } satisfies LookupAddress],
      null,
      PUBLIC_IP,
      4,
    ]);
  });

  it('refuses unsafe URLs, including a non-default port, before any lookup', async () => {
    const stub = stubTransport(200);
    const { resolver, calls } = countingResolver([PUBLIC_IP]);
    const unsafe = sender(stub.transport, resolver);

    for (const url of [
      'http://news.example.com/u',
      'https://news.example.com:8443/u',
      'https://unsubscribe.attacker.com:8443/',
      'https://127.0.0.1/u',
      'https://2130706433/u',
      'https://localhost/u',
      'https://user:secret@news.example.com/u',
    ]) {
      await expect(unsafe.sendOneClick(url), url).rejects.toBeInstanceOf(ValidationError);
    }
    await sender(stub.transport, resolver).sendOneClick('https://news.example.com:443/u');
    expect(stub.requests.map((request) => request.url.href)).toEqual([
      'https://news.example.com/u',
    ]);
    expect(calls).toEqual(['news.example.com']);
  });

  it('refuses hosts that resolve to any non-public address', async () => {
    const stub = stubTransport(200);
    for (const addresses of [
      ['10.0.0.5'],
      [PUBLIC_IP, '127.0.0.1'],
      ['fe80::1'],
      ['::ffff:192.168.1.1'],
      ['64:ff9b::a00:1'],
      ['2002:a00:1::1'],
      [],
    ]) {
      const { resolver } = countingResolver(addresses);
      await expect(
        sender(stub.transport, resolver).sendOneClick('https://news.example.com/u'),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    const failing: HostResolver = () => Promise.reject(new Error('ENOTFOUND'));
    await expect(
      sender(stub.transport, failing).sendOneClick('https://news.example.com/u'),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(stub.requests).toEqual([]);
  });

  it('pins IPv6 targets with their family', async () => {
    const stub = stubTransport(200);
    const { resolver } = countingResolver(['2606:4700::6810:84e5']);

    await sender(stub.transport, resolver).sendOneClick('https://news.example.com/u');

    expect(stub.requests[0]?.target).toEqual({ address: '2606:4700::6810:84e5', family: 6 });
  });

  it('treats redirects, error statuses and transport failures as provider errors', async () => {
    const { resolver } = countingResolver([PUBLIC_IP]);
    for (const status of [302, 404, 500]) {
      await expect(
        sender(stubTransport(status).transport, resolver).sendOneClick(
          'https://news.example.com/u',
        ),
      ).rejects.toBeInstanceOf(ProviderError);
    }
    await expect(
      sender(() => Promise.reject(new Error('reset')), resolver).sendOneClick(
        'https://news.example.com/u',
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
