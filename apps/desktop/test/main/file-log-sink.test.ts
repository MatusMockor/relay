import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileLogSink } from '../../src/main/infra/file-log-sink';
import { createTempDir, type TempDir } from './support/temp-dir';

describe('FileLogSink', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('writes records whose context JSON cannot serialize as is', async () => {
    const path = dir.file('logs/main.log');
    const sink = new FileLogSink(path);
    const cyclic: Record<string, unknown> = { name: 'job' };
    cyclic.self = cyclic;
    const at = '2026-11-15T08:00:00.000Z';

    sink.write({ at, level: 'info', message: 'big', context: { count: 1n } });
    sink.write({ at, level: 'warn', message: 'cycle', context: { job: cyclic } });
    sink.write({ at, level: 'error', message: 'after', context: {} });
    await sink.close();

    const lines = (await readFile(path, 'utf8')).trim().split('\n');
    const records = lines.map((line) => JSON.parse(line) as { message: string; context: unknown });
    expect(records).toEqual([
      { at, level: 'info', message: 'big', context: { count: '1' } },
      {
        at,
        level: 'warn',
        message: 'cycle',
        context: { job: { name: 'job', self: '[Circular]' } },
      },
      { at, level: 'error', message: 'after', context: {} },
    ]);
  });
});
