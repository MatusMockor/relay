import type { LookupAddress, LookupOptions } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { isPublicAddress } from '@relay/shared/net';
import { CalendarFeedError, FEED_MESSAGES } from './feed-errors';

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

export const guardedLookup =
  (allowPrivate: boolean): LookupFunction =>
  (hostname: string, options: LookupOptions, callback: LookupCallback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error !== null) {
        callback(new CalendarFeedError(FEED_MESSAGES.unresolved, { cause: error }), []);
        return;
      }
      const allowed = addresses.filter((entry) => allowPrivate || isPublicAddress(entry.address));
      if (allowed.length !== addresses.length || allowed.length === 0) {
        callback(new CalendarFeedError(FEED_MESSAGES.privateNetwork), []);
        return;
      }
      if (options.all === true) {
        callback(null, allowed);
        return;
      }
      const [first] = allowed;
      callback(null, first?.address ?? '', first?.family);
    });
  };
