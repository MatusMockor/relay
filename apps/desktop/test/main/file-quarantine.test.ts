import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandRunner } from '../../src/main/files/command-runner';
import { execFileRunner } from '../../src/main/files/exec-file-runner';
import { XattrFileQuarantine } from '../../src/main/files/xattr-file-quarantine';
import { createTestLogger } from './support/memory-log-sink';
import { createTempDir, type TempDir } from './support/temp-dir';

const NOW = { now: () => new Date('2026-11-19T10:00:00Z') };

const readQuarantine = (path: string): Promise<string> =>
  new Promise((resolve) => {
    execFile('/usr/bin/xattr', ['-p', 'com.apple.quarantine', path], (error, stdout) => {
      resolve(error === null ? stdout.trim() : '');
    });
  });

describe('quarantine of attachment copies opened in the system', () => {
  let commands: (readonly string[])[];
  const recording: CommandRunner = (file, args) => {
    commands.push([file, ...args]);
    return Promise.resolve();
  };

  beforeEach(() => {
    commands = [];
  });

  it('marks the file as downloaded on macOS', async () => {
    const quarantine = new XattrFileQuarantine(
      'darwin',
      'Relay',
      recording,
      NOW,
      createTestLogger().logger,
    );

    await quarantine.mark('/tmp/Relay-attachments/abc/faktura.pdf');

    expect(commands).toEqual([
      [
        '/usr/bin/xattr',
        '-w',
        'com.apple.quarantine',
        '0081;6afec8a0;Relay;',
        '/tmp/Relay-attachments/abc/faktura.pdf',
      ],
    ]);
  });

  it('does nothing on other systems', async () => {
    const quarantine = new XattrFileQuarantine(
      'linux',
      'Relay',
      recording,
      NOW,
      createTestLogger().logger,
    );

    await quarantine.mark('/tmp/a.pdf');

    expect(commands).toEqual([]);
  });

  it('logs a failed attempt and lets the file open anyway', async () => {
    const { logger, sink } = createTestLogger();
    const failing: CommandRunner = () => Promise.reject(new Error('xattr: permission denied'));
    const quarantine = new XattrFileQuarantine('darwin', 'Relay', failing, NOW, logger);

    await expect(quarantine.mark('/tmp/a.pdf')).resolves.toBeUndefined();

    expect(sink.messages()).toEqual(['Failed to quarantine an opened attachment']);
  });

  describe.runIf(process.platform === 'darwin')('with the real xattr tool', () => {
    let dir: TempDir;

    beforeEach(async () => {
      dir = await createTempDir();
    });

    afterEach(async () => {
      await dir.remove();
    });

    it('writes the quarantine attribute Gatekeeper reads', async () => {
      const path = dir.file('faktura.pdf');
      await writeFile(path, 'pdf');
      const quarantine = new XattrFileQuarantine(
        'darwin',
        'Relay',
        execFileRunner,
        NOW,
        createTestLogger().logger,
      );

      await quarantine.mark(path);

      expect(await readQuarantine(path)).toBe('0081;6afec8a0;Relay;');
    });
  });
});
