import type { AiRunnerRegistry, Clock, Logger } from '@relay/engine';
import type { Timers } from '../../platform/timers';
import { InstalledRunners } from './installed-runners';
import { RealtimeWakeups } from './realtime-wakeups';
import { RemoteAiJobRun } from './remote-ai-job-run';
import { type RemoteAiIntervals, RemoteAiJobWorker } from './remote-ai-job-worker';
import type { RemoteAiStatusListener } from './remote-ai-worker-status';
import type { FetchLike } from './server-session';
import type { ServerSessions } from './server-sessions';
import { WorkerApi } from './worker-api';

export interface RemoteAiConnectionDeps {
  readonly sessions: ServerSessions;
  readonly registry: AiRunnerRegistry;
  readonly clock: Clock;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly onStatus: RemoteAiStatusListener;
  readonly fetch?: FetchLike;
  readonly intervals?: RemoteAiIntervals;
  readonly timeoutMs?: number;
  readonly heartbeatMs?: number;
  readonly realtime?: boolean;
}

export interface RemoteAiConnection {
  readonly serverUrl: string;
  start(): void;
  wake(): void;
  stop(): Promise<void>;
}

const DEFAULT_INTERVALS: RemoteAiIntervals = { localMs: 10_000, serverMs: 60_000 };

export const connectRemoteAi = (
  serverUrl: string,
  deps: RemoteAiConnectionDeps,
): RemoteAiConnection => {
  const logger = deps.logger.child({ component: 'remote-ai', serverUrl });
  const session = deps.sessions.get(serverUrl);
  const api = new WorkerApi(serverUrl, session, deps.fetch);
  const worker = new RemoteAiJobWorker({
    api,
    runners: new InstalledRunners(deps.registry, deps.clock),
    jobRun: new RemoteAiJobRun({
      api,
      registry: deps.registry,
      timers: deps.timers,
      logger,
      timeoutMs: deps.timeoutMs ?? 120_000,
      heartbeatMs: deps.heartbeatMs ?? 30_000,
    }),
    timers: deps.timers,
    logger,
    intervals: deps.intervals ?? DEFAULT_INTERVALS,
    onStatus: deps.onStatus,
  });
  const wakeups =
    deps.realtime === false
      ? null
      : new RealtimeWakeups({
          serverUrl,
          session,
          timers: deps.timers,
          logger,
          onWake: () => {
            worker.wake();
          },
        });
  return {
    serverUrl,
    start: () => {
      worker.start();
      wakeups?.start();
    },
    wake: () => {
      worker.wake();
    },
    stop: async () => {
      wakeups?.stop();
      await worker.stop();
    },
  };
};
