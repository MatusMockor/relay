import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCliRunnerRegistry } from '../src/registry/create-cli-runner-registry';
import { stubDetector } from './support/ai-request';
import { createStubBin, type StubBin } from './support/stub-cli';

describe('DefaultAiRunnerRegistry', () => {
  let bin: StubBin;

  beforeEach(async () => {
    bin = await createStubBin();
  });

  afterEach(async () => {
    await bin.dispose();
  });

  it('exposes both CLI runners and detects them as runner infos', async () => {
    const claudePath = await bin.install('claude', {
      version: '2.1.325 (Claude Code)',
      auth: { output: 'garbage', exitCode: 0 },
    });
    const registry = createCliRunnerRegistry({
      location: 'server',
      detector: stubDetector(bin.dir),
    });

    expect(registry.list().map((runner) => runner.kind)).toEqual(['claude', 'codex']);
    expect(registry.get('codex')?.kind).toBe('codex');
    expect(await registry.detectAll()).toEqual([
      {
        runner: 'claude',
        location: 'server',
        installed: true,
        authenticated: null,
        version: '2.1.325',
        executablePath: claudePath,
      },
      {
        runner: 'codex',
        location: 'server',
        installed: false,
        authenticated: null,
        version: null,
        executablePath: null,
      },
    ]);
  });
});
