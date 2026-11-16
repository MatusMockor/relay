import {
  type FeedFetchOptions,
  HttpsCalendarFeedFetcher,
  IcalCalendarExpander,
  IcalCalendarParser,
  IcalReplyBuilder,
} from '@relay/calendar';
import type { CalendarAdapters, CalendarFeedSecrets } from '@relay/engine';

export const createCalendarAdapters = (
  feedSecrets: CalendarFeedSecrets,
  fetchOptions: Partial<FeedFetchOptions> = {},
): CalendarAdapters => ({
  parser: new IcalCalendarParser(),
  expander: new IcalCalendarExpander(),
  replyBuilder: new IcalReplyBuilder(),
  feedFetcher: new HttpsCalendarFeedFetcher(fetchOptions),
  feedSecrets,
});
