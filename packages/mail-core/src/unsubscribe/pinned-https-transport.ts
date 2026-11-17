import { request } from 'node:https';
import type { LookupFunction } from 'node:net';
import type { ResolvedAddress } from './public-host-guard';

export interface PinnedRequest {
  readonly url: URL;
  readonly target: ResolvedAddress;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly timeoutMs: number;
}

export type UnsubscribeTransport = (pinned: PinnedRequest) => Promise<number>;

export const pinnedLookup =
  (target: ResolvedAddress): LookupFunction =>
  (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{ address: target.address, family: target.family }]);
      return;
    }
    callback(null, target.address, target.family);
  };

export interface PinnedHttpsTransportOptions {
  readonly ca?: string;
}

export const createPinnedHttpsTransport =
  (options: PinnedHttpsTransportOptions = {}): UnsubscribeTransport =>
  (pinned) =>
    new Promise((resolve, reject) => {
      const outgoing = request(
        pinned.url,
        {
          method: 'POST',
          headers: { ...pinned.headers, 'content-length': String(Buffer.byteLength(pinned.body)) },
          lookup: pinnedLookup(pinned.target),
          servername: pinned.url.hostname,
          agent: false,
          ...(options.ca === undefined ? {} : { ca: options.ca }),
        },
        (response) => {
          clearTimeout(deadline);
          response.on('error', () => undefined);
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      const deadline = setTimeout(() => {
        outgoing.destroy(new Error('Unsubscribe request timed out'));
      }, pinned.timeoutMs);
      outgoing.on('error', (error) => {
        clearTimeout(deadline);
        reject(error);
      });
      outgoing.end(pinned.body);
    });

export const pinnedHttpsTransport: UnsubscribeTransport = createPinnedHttpsTransport();
