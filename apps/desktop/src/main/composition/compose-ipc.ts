import { type EngineServices, isEngineError, type Logger } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { NotificationRequest } from '@relay/shared/ipc';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from '../events/event-hub';
import {
  type AiHandlerDeps,
  createAiInvokeHandlers,
  createAiStreamHandlers,
} from '../handlers/ai-handlers';
import { createAppInfoHandler, type AppMetadata } from '../handlers/app-info';
import { createDeviceSettingsHandlers } from '../handlers/device-settings-handlers';
import { createAiJobHandlers } from '../handlers/local/ai-job-handlers';
import { createAttachmentHandlers } from '../handlers/local/attachment-handlers';
import { createAttachmentPickerHandlers } from '../handlers/attachment-picker-handlers';
import { createAccountHandlers } from '../handlers/local/account-handlers';
import { createCalendarHandlers } from '../handlers/local/calendar-handlers';
import { createFailedInvitationHandlers } from '../handlers/local/failed-invitation-handlers';
import { createGoogleCalendarHandlers } from '../handlers/local/google-calendar-handlers';
import { createComposeHandlers } from '../handlers/local/compose-handlers';
import { createDraftAttachmentHandlers } from '../handlers/local/draft-attachment-handlers';
import { createEventStreamHandlers } from '../handlers/local/event-stream-handlers';
import { createLabelHandlers } from '../handlers/local/label-handlers';
import { createSettingsHandlers } from '../handlers/local/settings-handlers';
import { createSyncHandlers, type SyncTrigger } from '../handlers/local/sync-handlers';
import { createTaskHandlers } from '../handlers/local/task-handlers';
import { createThreadHandlers } from '../handlers/local/thread-handlers';
import { createMenuCommandStreamHandlers } from '../handlers/menu-command-handlers';
import { mergeInvokeHandlers, mergeStreamHandlers } from '../handlers/merge-handlers';
import {
  createNotificationInvokeHandlers,
  createNotificationStreamHandlers,
} from '../handlers/notification-handlers';
import { createOAuthHandlers } from '../handlers/oauth-handlers';
import { createGoogleCalendarOAuthHandlers } from '../handlers/google-calendar-oauth-handlers';
import { createSecureHandlers } from '../handlers/secure-handlers';
import { createSessionHandlers } from '../handlers/session-handlers';
import { createTrayInvokeHandlers } from '../handlers/tray-handlers';
import {
  createUpdateInvokeHandlers,
  createUpdateStreamHandlers,
} from '../handlers/update-handlers';
import { createWindowStreamHandlers } from '../handlers/window-handlers';
import { type IpcInvokeHandlers, IpcInvokeRouter } from '../ipc/invoke-router';
import type { IpcRouters } from '../ipc/register-ipc';
import { IpcStreamRouter } from '../ipc/stream-router';
import type { ServerSessions } from '../ai/remote/server-sessions';
import type { AttachmentPicker } from '../files/attachment-picker';
import type { MenuCommandRequests } from '../native/menu-command-requests';
import type { RendererView } from '../native/renderer-view';
import type { ThreadOpenRequests } from '../native/thread-open-requests';
import type { GoogleOAuthCoordinator } from '../oauth/google-oauth-coordinator';
import type { GoogleCalendarOAuthCoordinator } from '../oauth/google-calendar-oauth-coordinator';
import type { SecretStore } from '../secure/secret-store';
import type { DeviceSettingsStore } from '../settings/device-settings-store';
import type { UpdateService } from '../updates/update-service';
import type { FullScreenState } from '../window/full-screen-state';

export interface LocalIpcDeps {
  readonly userId: UserId;
  readonly services: EngineServices;
  readonly sync: SyncTrigger;
  readonly hub: EventHub<RealtimeEvent>;
}

export interface MainProcessContext {
  readonly app: AppMetadata;
  readonly logger?: Logger;
  readonly deviceSettings?: DeviceSettingsStore;
  readonly secrets?: SecretStore;
  readonly sessions?: ServerSessions;
  readonly oauth?: GoogleOAuthCoordinator;
  readonly calendarOAuth?: GoogleCalendarOAuthCoordinator;
  readonly ai?: AiHandlerDeps;
  readonly local?: LocalIpcDeps;
  readonly attachmentPicker?: AttachmentPicker;
  readonly updates?: UpdateService;
  readonly threadOpens?: ThreadOpenRequests;
  readonly menuCommands?: MenuCommandRequests;
  readonly rendererView?: RendererView;
  readonly rendererNotifications?: EventHub<NotificationRequest>;
  readonly fullScreen?: FullScreenState;
}

const localInvokeHandlers = (local: LocalIpcDeps): IpcInvokeHandlers =>
  mergeInvokeHandlers(
    createThreadHandlers(local.services, local.userId),
    createLabelHandlers(local.services, local.userId),
    createAiJobHandlers(local.services, local.userId),
    createTaskHandlers(local.services, local.userId),
    createSyncHandlers(local.sync),
    createComposeHandlers(local.services, local.userId),
    createAttachmentHandlers(local.services, local.userId),
    createDraftAttachmentHandlers(local.services, local.userId),
    createAccountHandlers(local.services, local.userId),
    createSettingsHandlers(local.services, local.userId),
    createCalendarHandlers(local.services, local.userId),
    createFailedInvitationHandlers(local.services, local.userId),
    createGoogleCalendarHandlers(local.services, local.userId),
  );

const optional = <Deps, Handlers>(
  deps: Deps | undefined,
  create: (deps: Deps) => Handlers,
): Handlers | Record<string, never> => (deps === undefined ? {} : create(deps));

const errorReporter =
  (logger: Logger | undefined) =>
  (channel: string, error: unknown): void => {
    if (isEngineError(error) && error.code !== 'internal') {
      logger?.debug('IPC call failed', { channel, code: error.code, message: error.message });
      return;
    }
    logger?.error('IPC call failed unexpectedly', { channel, error });
  };

export const composeIpc = (context: MainProcessContext): IpcRouters => ({
  invoke: new IpcInvokeRouter(
    mergeInvokeHandlers(
      { 'app.getInfo': createAppInfoHandler(context.app) },
      optional(context.deviceSettings, createDeviceSettingsHandlers),
      optional(context.secrets, createSecureHandlers),
      optional(context.sessions, createSessionHandlers),
      optional(context.oauth, createOAuthHandlers),
      optional(context.calendarOAuth, createGoogleCalendarOAuthHandlers),
      optional(context.ai, createAiInvokeHandlers),
      optional(context.local, localInvokeHandlers),
      optional(context.attachmentPicker, createAttachmentPickerHandlers),
      optional(context.updates, createUpdateInvokeHandlers),
      optional(context.rendererView, createTrayInvokeHandlers),
      optional(context.rendererNotifications, createNotificationInvokeHandlers),
    ),
    errorReporter(context.logger),
  ),
  streams: new IpcStreamRouter(
    mergeStreamHandlers(
      optional(context.ai, createAiStreamHandlers),
      optional(context.local, (local) => createEventStreamHandlers(local.hub)),
      optional(context.updates, createUpdateStreamHandlers),
      optional(context.threadOpens, createNotificationStreamHandlers),
      optional(context.menuCommands, createMenuCommandStreamHandlers),
      optional(context.fullScreen, createWindowStreamHandlers),
    ),
    errorReporter(context.logger),
  ),
});
