import { type AiRunnerRegistry, type Clock, type Logger } from '@relay/engine';
import { createCliRunnerRegistry } from '@relay/ai';
import { engineMailToolBackend } from '@relay/mcp-mail';
import { LOCAL_USER_ID } from '@relay/store-sqlite';
import type { UserSettings } from '@relay/shared/domain';
import { AiLocationGate } from '../ai/ai-location-gate';
import { DeferredMailToolBackend } from '../ai/deferred-mail-tool-backend';
import { EngineLocalAiRuns } from '../ai/engine-local-ai-runs';
import type { FetchLike } from '../ai/remote/server-session';
import { ServerSessions } from '../ai/remote/server-sessions';
import {
  chooseSocketPath,
  LocalMailToolsServer,
  type MailToolsEndpoint,
  type McpEntryCommand,
} from '../ai/local-mail-tools-server';
import { createLocalBackground, type LocalBackground } from '../background/local-background';
import { EnvOrFileGoogleClientConfigSource } from '../oauth/google-client-config-source';
import { GoogleLoopbackFlow } from '../oauth/google-loopback-flow';
import { GoogleOAuthCoordinator } from '../oauth/google-oauth-coordinator';
import type { PowerEvents } from '../platform/power-events';
import type { SecretCipher } from '../platform/secret-cipher';
import type { Timers } from '../platform/timers';
import type { UrlOpener } from '../platform/url-opener';
import type { SyncTrigger } from '../handlers/local/sync-handlers';
import type { MainProcessContext } from './compose-ipc';
import { createLocalEngine, type LocalEngine } from './local-engine';
import type { LocalPaths } from './local-paths';
import { createMainInfrastructure, type MainInfrastructure } from './main-infrastructure';
import { EngineGoogleAccountConnector } from './google-account-connector';
import { createLocalDueJobs } from './local-due-jobs';
import { createLocalSyncTrigger } from './local-sync-trigger';

export interface LocalRuntimeInput {
  readonly paths: LocalPaths;
  readonly cipher: SecretCipher;
  readonly power: PowerEvents;
  readonly opener: UrlOpener;
  readonly timers: Timers;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly aiRunners?: AiRunnerRegistry;
  readonly mcpEntry?: McpEntryCommand | null;
  readonly oauthTimeoutMs?: number;
  readonly allowPlaintextMail?: boolean;
  readonly verifyGoogleAccounts?: boolean;
  readonly serverFetch?: FetchLike;
}

export interface LocalRuntime {
  readonly infrastructure: MainInfrastructure;
  readonly engine: LocalEngine;
  readonly aiRunners: AiRunnerRegistry;
  readonly serverSessions: ServerSessions;
  readonly background: LocalBackground;
  readonly ipc: Omit<MainProcessContext, 'app'>;
  readonly userSettings: () => Promise<UserSettings>;
  readonly sync: SyncTrigger;
  readonly mailToolsEndpoint: MailToolsEndpoint | null;
  start(): Promise<void>;
  close(): Promise<void>;
}

export const createLocalRuntime = (input: LocalRuntimeInput): LocalRuntime => {
  const infrastructure = createMainInfrastructure(input);
  const serverSessions = new ServerSessions({
    secrets: infrastructure.rendererSecrets,
    clock: input.clock,
    fetch: input.serverFetch,
  });
  const googleClient = new EnvOrFileGoogleClientConfigSource(input.env, input.paths.googleClient);
  const aiRunners = input.aiRunners ?? createCliRunnerRegistry({ location: 'local' });
  const mailToolsBackend = new DeferredMailToolBackend();
  const mailTools =
    input.mcpEntry === undefined || input.mcpEntry === null
      ? null
      : new LocalMailToolsServer(
          chooseSocketPath(input.paths.userData),
          mailToolsBackend,
          input.mcpEntry,
        );
  const engine = createLocalEngine({
    infrastructure,
    googleClient,
    aiRunners,
    mailTools: mailTools?.endpoint ?? null,
    allowPlaintextMail: input.allowPlaintextMail ?? false,
  });
  const { services } = engine;
  mailToolsBackend.bind(engineMailToolBackend(services, LOCAL_USER_ID));
  const userSettings = () => services.settings.get(LOCAL_USER_ID);
  const aiGate = new AiLocationGate(() => services.ai.locationFor(LOCAL_USER_ID));
  const background = createLocalBackground({
    listAccounts: () => services.accounts.list(LOCAL_USER_ID),
    syncAccount: async (accountId) => {
      await services.sync.syncAccount(LOCAL_USER_ID, accountId);
    },
    watcher: { watch: (accountId) => services.sync.watchAccount(LOCAL_USER_ID, accountId) },
    dueJobs: createLocalDueJobs(services, aiGate),
    hub: infrastructure.hub,
    power: input.power,
    timers: input.timers,
    logger: input.logger,
  });
  const sync = createLocalSyncTrigger(services, LOCAL_USER_ID);
  const oauth = new GoogleOAuthCoordinator(
    new GoogleLoopbackFlow(googleClient, input.opener, input.oauthTimeoutMs),
    new EngineGoogleAccountConnector(services, LOCAL_USER_ID, {
      verifyConnection: input.verifyGoogleAccounts ?? true,
    }),
  );
  return {
    infrastructure,
    engine,
    aiRunners,
    serverSessions,
    background,
    userSettings,
    sync,
    mailToolsEndpoint: mailTools?.endpoint ?? null,
    ipc: {
      logger: input.logger.child({ component: 'ipc' }),
      deviceSettings: infrastructure.deviceSettings,
      secrets: infrastructure.rendererSecrets,
      sessions: serverSessions,
      oauth,
      ai: {
        registry: aiRunners,
        gate: aiGate,
        runs: new EngineLocalAiRuns(services, LOCAL_USER_ID),
      },
      local: {
        userId: LOCAL_USER_ID,
        services,
        sync,
        hub: infrastructure.hub,
      },
    },
    start: async () => {
      await services.ai.relocateQueued(LOCAL_USER_ID);
      await mailTools?.listen();
    },
    close: async () => {
      await oauth.shutdown();
      await background.shutdown();
      await mailTools?.close();
      engine.close();
    },
  };
};
