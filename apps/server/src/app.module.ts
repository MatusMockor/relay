import { type DynamicModule, Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { AiModule } from './ai/ai.module';
import { AiRuntimeModule } from './ai/ai-runtime.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuthModule } from './auth/auth.module';
import { CalendarAdaptersModule } from './calendar/calendar-adapters.module';
import { CalendarModule } from './calendar/calendar.module';
import { ComposeModule } from './compose/compose.module';
import { ServerConfigModule } from './config/config.module';
import type { ServerConfig } from './config/server-config';
import { DevicesModule } from './devices/devices.module';
import { EngineModule } from './engine/engine.module';
import { EventsModule } from './events/events.module';
import { FoldersModule } from './folders/folders.module';
import { GoogleCalendarAdaptersModule } from './google-calendar/google-calendar-adapters.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { HealthModule } from './health/health.module';
import { HttpModule } from './http/http.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { JobsModule } from './jobs/jobs.module';
import { LabelsModule } from './labels/labels.module';
import { MailModule } from './mail/mail.module';
import { PersistenceModule } from './persistence';
import { toPersistenceConfig } from './persistence-config.factory';
import { RealtimeModule } from './realtime/realtime.module';
import { SettingsModule } from './settings/settings.module';
import { AutomationsModule } from './automations/automations.module';
import { SplitsModule } from './splits/splits.module';
import { SyncModule } from './sync/sync.module';
import { TaskSystemAdaptersModule } from './task-systems/task-system-adapters.module';
import { TaskSystemsModule } from './task-systems/task-systems.module';
import { TasksModule } from './tasks/tasks.module';
import { ThreadsModule } from './threads/threads.module';

@Module({})
export class AppModule {
  static forRoot(config: ServerConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ServerConfigModule.forRoot(config),
        InfrastructureModule,
        EventsModule,
        HttpModule,
        PersistenceModule.forRoot({ config: toPersistenceConfig(config) }),
        MailModule,
        AiRuntimeModule,
        CalendarAdaptersModule,
        GoogleCalendarAdaptersModule,
        TaskSystemAdaptersModule,
        EngineModule,
        JobsModule,
        AuthModule,
        DevicesModule,
        RealtimeModule,
        HealthModule,
        AiModule,
        ThreadsModule,
        LabelsModule,
        FoldersModule,
        TasksModule,
        ComposeModule,
        AttachmentsModule,
        SplitsModule,
        AutomationsModule,
        AccountsModule,
        SettingsModule,
        SyncModule,
        CalendarModule,
        GoogleCalendarModule,
        TaskSystemsModule,
      ],
    };
  }
}
