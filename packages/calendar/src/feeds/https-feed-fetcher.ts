import { isIP } from 'node:net';
import type {
  CalendarFeedFetcher,
  CalendarFeedResult,
  CalendarFeedValidators,
} from '@relay/engine';
import { isPublicAddress } from '@relay/shared/net';
import { CalendarFeedError, FEED_MESSAGES } from './feed-errors';
import { DEFAULT_FEED_FETCH_OPTIONS, type FeedFetchOptions } from './feed-options';
import { type FeedResponse, requestFeed } from './feed-request';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const headerOf = (response: FeedResponse, name: string): string | null => {
  const value = response.headers[name];
  return typeof value === 'string' && value.length <= 512 ? value : null;
};

const bareHost = (url: URL): string => url.hostname.replace(/^\[|\]$/g, '');

export class HttpsCalendarFeedFetcher implements CalendarFeedFetcher {
  private readonly options: FeedFetchOptions;

  constructor(options: Partial<FeedFetchOptions> = {}) {
    this.options = { ...DEFAULT_FEED_FETCH_OPTIONS, ...options };
  }

  async fetch(url: string, validators: CalendarFeedValidators): Promise<CalendarFeedResult> {
    const deadline = Date.now() + this.options.timeoutMs;
    let target = this.checked(URL.parse(url));
    for (let hop = 0; hop <= this.options.maxRedirects; hop += 1) {
      const response = await requestFeed(
        target,
        validators,
        this.options,
        Math.max(1, deadline - Date.now()),
      );
      const location = headerOf(response, 'location');
      if (REDIRECTS.has(response.status) && location !== null) {
        target = this.checked(URL.parse(location, target.href));
        continue;
      }
      return this.resultOf(response);
    }
    throw new CalendarFeedError(FEED_MESSAGES.tooManyRedirects);
  }

  private resultOf(response: FeedResponse): CalendarFeedResult {
    if (response.status === 304) {
      return { kind: 'not-modified' };
    }
    if (response.status < 200 || response.status >= 300 || response.body === null) {
      throw new CalendarFeedError(FEED_MESSAGES.status(response.status));
    }
    return {
      kind: 'fetched',
      body: new TextDecoder('utf-8').decode(response.body),
      etag: headerOf(response, 'etag'),
      lastModified: headerOf(response, 'last-modified'),
    };
  }

  private checked(url: URL | null): URL {
    if (url === null) {
      throw new CalendarFeedError(FEED_MESSAGES.invalidUrl);
    }
    const insecureAllowed = this.options.allowInsecureHttp && url.protocol === 'http:';
    if (url.protocol !== 'https:' && !insecureAllowed) {
      throw new CalendarFeedError(FEED_MESSAGES.insecure);
    }
    const host = bareHost(url);
    if (isIP(host) !== 0 && !this.options.allowPrivateNetworks && !isPublicAddress(host)) {
      throw new CalendarFeedError(FEED_MESSAGES.privateNetwork);
    }
    return url;
  }
}
