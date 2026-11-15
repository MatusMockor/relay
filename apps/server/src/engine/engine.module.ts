import { Global, Module, type Provider } from '@nestjs/common';
import {
  AccountService,
  AiService,
  AttachmentContentService,
  ComposeService,
  type EngineServices,
  InboxQueryService,
  LabelQueryService,
  MessageActionsService,
  ReminderService,
  SettingsService,
  SplitService,
  SyncService,
  TaskService,
  ThreadAiPreparer,
  ThreadChecklistService,
  ThreadQueryService,
} from '@relay/engine';
import { engineRepositoriesProvider } from './engine-repositories.provider';
import { engineServicesProvider } from './engine-services.provider';
import { ENGINE_SERVICES } from './engine.tokens';

const service = <Key extends keyof EngineServices>(
  token: abstract new (...args: never[]) => EngineServices[Key],
  key: Key,
): Provider => ({
  provide: token,
  inject: [ENGINE_SERVICES],
  useFactory: (services: EngineServices) => services[key],
});

const SERVICE_PROVIDERS: Provider[] = [
  service(InboxQueryService, 'inbox'),
  service(LabelQueryService, 'labels'),
  service(ThreadQueryService, 'threads'),
  service(ThreadAiPreparer, 'threadAi'),
  service(ThreadChecklistService, 'checklist'),
  service(MessageActionsService, 'actions'),
  service(ReminderService, 'reminders'),
  service(TaskService, 'tasks'),
  service(SyncService, 'sync'),
  service(ComposeService, 'compose'),
  service(SplitService, 'splits'),
  service(AiService, 'ai'),
  service(AttachmentContentService, 'attachments'),
  service(AccountService, 'accounts'),
  service(SettingsService, 'settings'),
];

@Global()
@Module({
  providers: [engineRepositoriesProvider, engineServicesProvider, ...SERVICE_PROVIDERS],
  exports: [
    InboxQueryService,
    LabelQueryService,
    ThreadQueryService,
    ThreadAiPreparer,
    ThreadChecklistService,
    MessageActionsService,
    ReminderService,
    TaskService,
    SyncService,
    ComposeService,
    SplitService,
    AiService,
    AttachmentContentService,
    AccountService,
    SettingsService,
  ],
})
export class EngineModule {}
