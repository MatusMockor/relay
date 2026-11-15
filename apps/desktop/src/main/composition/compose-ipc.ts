import { type EngineServices, isEngineError, type Logger } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
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
import { createAccountHandlers } from '../handlers/local/account-handlers';
import { createComposeHandlers } from '../handlers/local/compose-handlers';
import { createEventStreamHandlers } from '../handlers/local/event-stream-handlers';
import { createSettingsHandlers } from '../handlers/local/settings-handlers';
import { createSyncHandlers, type SyncTrigger } from '../handlers/local/sync-handlers';
import { createTaskHandlers } from '../handlers/local/task-handlers';
import { createThreadHandlers } from '../handlers/local/thread-handlers';
import { mergeInvokeHandlers, mergeStreamHandlers } from '../handlers/merge-handlers';
import { createOAuthHandlers } from '../handlers/oauth-handlers';
import { createSecureHandlers } from '../handlers/secure-handlers';
import { createSessionHandlers } from '../handlers/session-handlers';
import { type IpcInvokeHandlers, IpcInvokeRouter } from '../ipc/invoke-router';
import type { IpcRouters } from '../ipc/register-ipc';
import { IpcStreamRouter } from '../ipc/stream-router';
import type { ServerSessions } from '../ai/remote/server-sessions';
import type { GoogleOAuthCoordinator } from '../oauth/google-oauth-coordinator';
import type { SecretStore } from '../secure/secret-store';
import type { DeviceSettingsStore } from '../settings/device-settings-store';

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
  readonly ai?: AiHandlerDeps;
  readonly local?: LocalIpcDeps;
}

const localInvokeHandlers = (local: LocalIpcDeps): IpcInvokeHandlers =>
  mergeInvokeHandlers(
    createThreadHandlers(local.services, local.userId),
    createAiJobHandlers(local.services, local.userId),
    createTaskHandlers(local.services, local.userId),
    createSyncHandlers(local.sync),
    createComposeHandlers(local.services, local.userId),
    createAttachmentHandlers(local.services, local.userId),
    createAccountHandlers(local.services, local.userId),
    createSettingsHandlers(local.services, local.userId),
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
      optional(context.ai, createAiInvokeHandlers),
      optional(context.local, localInvokeHandlers),
    ),
    errorReporter(context.logger),
  ),
  streams: new IpcStreamRouter(
    mergeStreamHandlers(
      optional(context.ai, createAiStreamHandlers),
      optional(context.local, (local) => createEventStreamHandlers(local.hub)),
    ),
    errorReporter(context.logger),
  ),
});
