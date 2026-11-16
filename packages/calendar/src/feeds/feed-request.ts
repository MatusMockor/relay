import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { CalendarFeedValidators } from '@relay/engine';
import { CalendarFeedError, FEED_MESSAGES } from './feed-errors';
import type { FeedFetchOptions } from './feed-options';
import { guardedLookup } from './guarded-lookup';

export interface FeedResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer | null;
}

const headersFor = (validators: CalendarFeedValidators): Record<string, string> => ({
  accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1',
  'user-agent': 'Relay-Calendar/1.0',
  ...(validators.etag === null ? {} : { 'if-none-match': validators.etag }),
  ...(validators.lastModified === null ? {} : { 'if-modified-since': validators.lastModified }),
});

const readBody = (response: IncomingMessage, maxBytes: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const declared = Number(response.headers['content-length'] ?? '0');
    if (declared > maxBytes) {
      response.destroy();
      reject(new CalendarFeedError(FEED_MESSAGES.tooLarge));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        response.destroy(new CalendarFeedError(FEED_MESSAGES.tooLarge));
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    response.on('error', reject);
  });

const wantsBody = (status: number): boolean => status >= 200 && status < 300;

export const requestFeed = (
  url: URL,
  validators: CalendarFeedValidators,
  options: FeedFetchOptions,
  remainingMs: number,
): Promise<FeedResponse> =>
  new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(url, {
      method: 'GET',
      headers: headersFor(validators),
      lookup: guardedLookup(options.allowPrivateNetworks),
      agent: false,
      ...(options.ca === undefined ? {} : { ca: options.ca }),
    });
    const timer = setTimeout(() => {
      request.destroy(new CalendarFeedError(FEED_MESSAGES.timeout));
    }, remainingMs);
    const fail = (error: unknown): void => {
      clearTimeout(timer);
      reject(
        error instanceof CalendarFeedError
          ? error
          : new CalendarFeedError(FEED_MESSAGES.network, { cause: error }),
      );
    };
    request.on('error', fail);
    request.on('response', (response) => {
      const status = response.statusCode ?? 0;
      if (!wantsBody(status)) {
        response.resume();
        clearTimeout(timer);
        resolve({ status, headers: response.headers, body: null });
        return;
      }
      readBody(response, options.maxBytes).then((body) => {
        clearTimeout(timer);
        resolve({ status, headers: response.headers, body });
      }, fail);
    });
    request.end();
  });
