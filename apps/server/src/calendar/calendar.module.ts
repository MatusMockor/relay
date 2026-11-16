import { Module } from '@nestjs/common';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarFeedScheduler } from './calendar-feed-scheduler';
import { CalendarSubscriptionsController } from './calendar-subscriptions.controller';

@Module({
  controllers: [CalendarEventsController, CalendarSubscriptionsController],
  providers: [CalendarFeedScheduler],
})
export class CalendarModule {}
