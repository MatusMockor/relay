import type { AiRunnerRegistry, Clock, Logger } from '@relay/engine';
import type { Timers } from '../../platform/timers';
import { connectRemoteAi, type RemoteAiConnectionDeps } from './remote-ai-connection';
import { type DeviceSettingsSource, RemoteAiSupervisor } from './remote-ai-supervisor';
import type { ServerSessions } from './server-sessions';

export interface RemoteAiSupervisorInput {
  readonly deviceSettings: DeviceSettingsSource;
  readonly sessions: ServerSessions;
  readonly registry: AiRunnerRegistry;
  readonly clock: Clock;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly options?: Omit<
    RemoteAiConnectionDeps,
    'sessions' | 'registry' | 'clock' | 'timers' | 'logger' | 'onStatus'
  >;
}

export const createRemoteAiSupervisor = (input: RemoteAiSupervisorInput): RemoteAiSupervisor =>
  new RemoteAiSupervisor(
    input.deviceSettings,
    (serverUrl, onStatus) =>
      connectRemoteAi(serverUrl, {
        ...input.options,
        sessions: input.sessions,
        registry: input.registry,
        clock: input.clock,
        timers: input.timers,
        logger: input.logger,
        onStatus,
      }),
    input.logger,
  );
