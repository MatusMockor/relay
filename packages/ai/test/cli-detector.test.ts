import { relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliDetector } from '../src/detection/cli-detector';
import { CliLocator } from '../src/detection/cli-locator';
import { stubDetector } from './support/ai-request';
import { createStubBin, type StubBin } from './support/stub-cli';

describe('CliDetector', () => {
  let bin: StubBin;

  beforeEach(async () => {
    bin = await createStubBin();
  });

  afterEach(async () => {
    await bin.dispose();
  });

  it('reports an installed and logged in claude with its version', async () => {
    const path = await bin.install('claude', {
      version: '2.1.325 (Claude Code)',
      auth: { output: '{"loggedIn":true,"authMethod":"claude.ai"}', exitCode: 0 },
    });

    expect(await stubDetector(bin.dir).detect('claude')).toEqual({
      runner: 'claude',
      installed: true,
      version: '2.1.325',
      path,
      authenticated: true,
      detail: 'claude.ai',
    });
  });

  it('reports a logged out codex', async () => {
    await bin.install('codex', {
      version: 'codex-cli 0.169.0',
      auth: { output: 'Not logged in', exitCode: 1 },
    });

    expect(await stubDetector(bin.dir).detect('codex')).toMatchObject({
      installed: true,
      version: '0.169.0',
      authenticated: false,
      detail: 'Not logged in',
    });
  });

  it('reports a logged in codex', async () => {
    await bin.install('codex', {
      version: 'codex-cli 0.169.0',
      auth: { output: 'Logged in using ChatGPT', exitCode: 0 },
    });

    expect(await stubDetector(bin.dir).detect('codex')).toMatchObject({ authenticated: true });
  });

  it('falls back to unknown when the auth output cannot be interpreted', async () => {
    await bin.install('claude', { version: '2.1.0', auth: { output: 'unexpected', exitCode: 0 } });

    expect(await stubDetector(bin.dir).detect('claude')).toMatchObject({
      authenticated: 'unknown',
      detail: 'unexpected',
    });
  });

  it('keeps the codex login state unknown when the status check itself fails', async () => {
    await bin.install('codex', {
      version: 'codex-cli 0.169.0',
      auth: { output: 'Error checking login status: permission denied', exitCode: 1 },
    });

    expect(await stubDetector(bin.dir).detect('codex')).toMatchObject({
      authenticated: 'unknown',
      detail: 'Error checking login status: permission denied',
    });
  });

  it('resolves an executable found through a relative PATH entry to an absolute path', async () => {
    const path = await bin.install('codex', { version: '0.169.0' });
    const locator = new CliLocator({ pathEnv: relative(process.cwd(), bin.dir), extraDirs: [] });

    expect(await locator.locate('codex')).toBe(path);
  });

  it('finds executables in extra install locations outside PATH', async () => {
    await bin.install('codex', { version: '0.169.0', auth: { output: 'Logged in', exitCode: 0 } });
    const detector = new CliDetector({
      locator: new CliLocator({ pathEnv: '', extraDirs: [bin.dir] }),
    });

    expect(await detector.detect('codex')).toMatchObject({ installed: true });
  });

  it('reports missing CLIs as not installed', async () => {
    expect(await stubDetector(bin.dir).detectAll()).toEqual([
      expect.objectContaining({ runner: 'claude', installed: false, path: null }),
      expect.objectContaining({ runner: 'codex', installed: false, path: null }),
    ]);
  });
});
