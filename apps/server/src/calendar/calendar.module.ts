import { Module } from '@nestjs/common';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarFeedScheduler } from './calendar-feed-scheduler';
import { CalendarSubscriptionsController } from './calendar-subscriptions.controller';
import { FailedInvitationsController } from './failed-invitations.controller';

@Module({
  controllers: [
    CalendarEventsController,
    CalendarSubscriptionsController,
    FailedInvitationsController,
  ],
  providers: [CalendarFeedScheduler],
})
export class CalendarModule {}
