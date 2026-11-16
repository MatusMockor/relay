import { access } from 'node:fs/promises';
import { CliDetector, CliLocator, createCliRunnerRegistry } from '@relay/ai';
import type { AiRunnerRegistry } from '@relay/engine';
import { type AiJob, AiJobSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRemoteAiSupervisor } from '../../src/main/ai/remote/create-remote-ai-supervisor';
import type { RemoteAiSupervisor } from '../../src/main/ai/remote/remote-ai-supervisor';
import { sessionSecretKey } from '../../src/main/ai/remote/server-session-key';
import { ServerSessions } from '../../src/main/ai/remote/server-sessions';
import { systemClock } from '../../src/main/infra/system-clock';
import { systemTimers } from '../../src/main/platform/timers';
import { EncryptedFileSecretStore } from '../../src/main/secure/encrypted-file-secret-store';
import { NamespacedSecretStore } from '../../src/main/secure/namespaced-secret-store';
import type { SecretStore } from '../../src/main/secure/secret-store';
import { DeviceSettingsStore } from '../../src/main/settings/device-settings-store';
import { serverDetail, serverThread } from '../../src/renderer/test/support/thread-fixtures';
import { AesTestCipher } from './support/aes-test-cipher';
import { createTestLogger } from './support/memory-log-sink';
import { installSlowClaude } from './support/slow-claude';
import { installStubClaude, type StubClaude } from './support/stub-claude';
import { startStubRelayServer, type StubRelayServer } from './support/stub-relay-server';
import { createTempDir, type TempDir } from './support/temp-dir';

const STAMP = '2026-11-15T08:00:00.000Z';

const summaryJob = (id: string): AiJob =>
  AiJobSchema.parse({
    id,
    userId: 'user-1',
    kind: 'summary',
    status: 'queued',
    runnerLocation: 'local',
    runner: 'claude',
    input: { kind: 'summary', threadId: 'thread-1' },
    output: null,
    error: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  });

const registryFor = (dir: string): AiRunnerRegistry =>
  createCliRunnerRegistry({
    location: 'local',
    detector: new CliDetector({ locator: new CliLocator({ pathEnv: dir, extraDirs: [] }) }),
  });

describe('remote AI worker in synced mode', () => {
  let dir: TempDir;
  let server: StubRelayServer;
  let claude: StubClaude;
  let secrets: SecretStore;
  let settings: DeviceSettingsStore;
  let supervisor: RemoteAiSupervisor | null;

  beforeEach(async () => {
    dir = await createTempDir();
    server = await startStubRelayServer();
    claude = await installStubClaude();
    secrets = new NamespacedSecretStore(
      new EncryptedFileSecretStore(dir.file('secrets.bin'), new AesTestCipher()),
      'renderer',
    );
    settings = new DeviceSettingsStore(dir.file('device-settings.json'));
    await settings.update({ mode: 'synced', activeServerUrl: server.url });
    await secrets.set(sessionSecretKey(server.url), JSON.stringify(server.tokens));
    supervisor = null;
  });

  afterEach(async () => {
    await supervisor?.stop();
    await server.close();
    await claude.dispose();
    await dir.remove();
  });

  const start = async (
    registry: AiRunnerRegistry = registryFor(claude.dir),
    realtime = false,
    localMs = 100,
  ): Promise<RemoteAiSupervisor> => {
    supervisor = createRemoteAiSupervisor({
      deviceSettings: settings,
      sessions: new ServerSessions({ secrets, clock: systemClock }),
      registry,
      clock: systemClock,
      timers: systemTimers,
      logger: createTestLogger().logger,
      options: { intervals: { localMs, serverMs: 200 }, heartbeatMs: 50, realtime },
    });
    await supervisor.start();
    return supervisor;
  };

  it('does not claim jobs while no CLI is installed on this device', async () => {
    server.queue(summaryJob('job-1'));
    const empty = await createTempDir('relay-no-cli-');
    const worker = await start(registryFor(empty.path));

    await expect.poll(() => worker.status.state).toBe('noRunner');
    expect(server.calls).not.toContain('POST /ai/worker/claims');
    await empty.remove();
  });

  it('idles while the user runs AI on the server and stops on logout or mode change', async () => {
    server.location = 'server';
    const worker = await start();
    await expect.poll(() => worker.status.state).toBe('serverLocation');

    await secrets.delete(sessionSecretKey(server.url));
    await expect.poll(() => worker.status.state).toBe('signedOut');

    await settings.update({ mode: 'local' });
    await expect.poll(() => worker.status.state).toBe('stopped');
    const claims = server.calls.length;
    server.location = 'local';
    server.queue(summaryJob('job-after-stop'));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(server.calls.length).toBe(claims);
  });

  it('abandons a run whose lease was lost without settling it', async () => {
    const slow = await installSlowClaude();
    server.queue(summaryJob('job-slow'), serverDetail(serverThread('Pomalé'), []));
    const worker = await start(registryFor(slow.dir));
    await expect
      .poll(
        () =>
          access(slow.startedFile).then(
            () => true,
            () => false,
          ),
        {
          timeout: 10_000,
        },
      )
      .toBe(true);

    server.expireLease('job-slow');

    await expect.poll(() => worker.status.state, { timeout: 10_000 }).toBe('idle');
    expect(server.completed).toEqual([]);
    expect(server.failed).toEqual([]);
    await supervisor?.stop();
    supervisor = null;
    await slow.dispose();
  });

  it('refreshes a session about to expire and stores the rotated tokens for the renderer', async () => {
    const expiring = server.issueTokens(60_000);
    await secrets.set(sessionSecretKey(server.url), JSON.stringify(expiring));
    await start();

    await expect.poll(() => server.calls.includes('POST /ai/worker/claims')).toBe(true);
    expect(server.calls.filter((call) => call === 'POST /auth/refresh')).toHaveLength(1);
    const stored = await secrets.get(sessionSecretKey(server.url));
    expect(stored === null ? null : (JSON.parse(stored) as unknown)).toEqual(server.tokens);
  });

  it('claims at once when the server announces a queued local job', async () => {
    await start(registryFor(claude.dir), true, 60_000);
    await expect.poll(() => server.sockets.length).toBe(1);
    await expect.poll(() => server.calls.includes('POST /ai/worker/claims')).toBe(true);

    const job = summaryJob('job-pushed');
    server.queue(job, serverDetail(serverThread('Push'), []));
    server.push({ type: 'ai.job.updated', at: STAMP, data: { job } });

    await expect.poll(() => server.completed.length, { timeout: 5_000 }).toBe(1);
  });
});
