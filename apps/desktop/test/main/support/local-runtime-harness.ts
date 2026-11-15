import { DefaultAiRunnerRegistry } from '@relay/ai';
import type { AiRunnerRegistry } from '@relay/engine';
import { SQLITE_MIGRATIONS_FOLDER } from '@relay/store-sqlite';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { RelayBridge } from '@relay/shared/ipc';
import { composeIpc } from '../../../src/main/composition/compose-ipc';
import type { IpcRouters } from '../../../src/main/ipc/register-ipc';
import { resolveLocalPaths } from '../../../src/main/composition/local-paths';
import { createLocalRuntime, type LocalRuntime } from '../../../src/main/composition/local-runtime';
import { systemClock } from '../../../src/main/infra/system-clock';
import { systemTimers } from '../../../src/main/platform/timers';
import { createRelayBridge } from '../../../src/preload/create-bridge';
import { AesTestCipher } from './aes-test-cipher';
import { InMemoryIpc } from '../in-memory-ipc';
import { createTestLogger, type MemoryLogSink } from './memory-log-sink';
import { StubBrowser } from './stub-google';
import { TestPowerEvents } from './test-power-events';
import type { TempDir } from './temp-dir';

export interface LocalRuntimeHarness {
  readonly runtime: LocalRuntime;
  readonly bridge: RelayBridge;
  readonly routers: IpcRouters;
  readonly events: RealtimeEvent[];
  readonly logs: MemoryLogSink;
  close(): Promise<void>;
}

let streamSequence = 0;

export interface LocalRuntimeHarnessOptions {
  readonly withMailTools?: boolean;
  readonly aiRunners?: AiRunnerRegistry;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export const startLocalRuntime = (
  dir: TempDir,
  options: LocalRuntimeHarnessOptions = {},
): LocalRuntimeHarness => {
  const testLogger = createTestLogger();
  const runtime = createLocalRuntime({
    paths: resolveLocalPaths(dir.path, SQLITE_MIGRATIONS_FOLDER),
    cipher: new AesTestCipher(),
    power: new TestPowerEvents(),
    opener: new StubBrowser('approve'),
    timers: systemTimers,
    clock: systemClock,
    logger: testLogger.logger,
    env: options.env ?? {},
    aiRunners: options.aiRunners ?? new DefaultAiRunnerRegistry([]),
    verifyGoogleAccounts: false,
    allowPlaintextMail: true,
    mcpEntry:
      options.withMailTools === true
        ? { command: process.execPath, args: ['relay-mail-mcp.js'], env: { RELAY_TEST: '1' } }
        : null,
  });
  const routers = composeIpc({
    app: {
      name: 'Relay',
      version: '0.1.0',
      isPackaged: false,
      platform: 'linux',
      electronVersion: '45.3.2',
    },
    ...runtime.ipc,
  });
  const bridge = createRelayBridge(new InMemoryIpc(routers), () => {
    streamSequence += 1;
    return `stream-${String(streamSequence)}`;
  });
  const events: RealtimeEvent[] = [];
  const unsubscribe = bridge.subscribe('local.events', {
    onEvent: (event) => events.push(event),
  });
  return {
    runtime,
    bridge,
    routers,
    events,
    logs: testLogger.sink,
    close: async () => {
      unsubscribe();
      await runtime.close();
    },
  };
};
