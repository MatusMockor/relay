import { readFileSync } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import {
  HttpsCalendarFeedFetcher,
  IcalCalendarExpander,
  IcalCalendarParser,
  IcalReplyBuilder,
} from '@relay/calendar';
import { type CalendarAdapters, type CalendarFeedSecrets, PORT_TOKENS } from '@relay/engine';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { CALENDAR_FEED_SECRETS } from '../persistence';

@Global()
@Module({
  providers: [
    {
      provide: PORT_TOKENS.CalendarAdapters,
      inject: [SERVER_CONFIG, CALENDAR_FEED_SECRETS],
      useFactory: (config: ServerConfig, feedSecrets: CalendarFeedSecrets): CalendarAdapters => ({
        parser: new IcalCalendarParser(),
        expander: new IcalCalendarExpander(),
        replyBuilder: new IcalReplyBuilder(),
        feedFetcher: new HttpsCalendarFeedFetcher({
          allowPrivateNetworks: config.calendar.allowPrivateNetworks,
          ...(config.calendar.caFile === null
            ? {}
            : { ca: readFileSync(config.calendar.caFile, 'utf8') }),
        }),
        feedSecrets,
      }),
    },
  ],
  exports: [PORT_TOKENS.CalendarAdapters],
})
export class CalendarAdaptersModule {}
