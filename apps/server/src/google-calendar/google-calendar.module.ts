import { Module } from '@nestjs/common';
import { GoogleCalendarConnector } from './google-calendar-connector';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarScheduler } from './google-calendar-scheduler';

@Module({
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarConnector, GoogleCalendarScheduler],
})
export class GoogleCalendarModule {}
