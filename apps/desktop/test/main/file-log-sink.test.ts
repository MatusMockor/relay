import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileLogSink } from '../../src/main/infra/file-log-sink';
import { createTempDir, type TempDir } from './support/temp-dir';

const DROPPED = 'Log records dropped while the log file was busy';

interface WrittenRecord {
  readonly message: string;
  readonly context: { readonly dropped?: number };
}

const droppedIn = (records: readonly WrittenRecord[]): number =>
  records
    .filter((record) => record.message === DROPPED)
    .reduce((total, record) => total + (record.context.dropped ?? 0), 0);

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

  it('drops records while the backlog is full and reports how many after it drains', async () => {
    const path = dir.file('logs/main.log');
    const sink = new FileLogSink(path, { maxBacklogBytes: 512 });
    const at = '2026-11-15T08:00:00.000Z';

    for (let index = 0; index < 100; index += 1) {
      sink.write({ at, level: 'info', message: `record-${String(index)}`, context: {} });
    }
    await vi.waitFor(async () => {
      expect(await readFile(path, 'utf8')).toContain(DROPPED);
    });
    sink.write({ at, level: 'info', message: 'after', context: {} });
    await sink.close();

    const lines = (await readFile(path, 'utf8')).trim().split('\n');
    const records = lines.map((line) => JSON.parse(line) as WrittenRecord);
    const kept = records.filter((record) => record.message.startsWith('record-'));
    expect(kept.map((record) => record.message)).toEqual(
      kept.map((_record, index) => `record-${String(index)}`),
    );
    expect(kept.length).toBeLessThan(100);
    expect(records.at(-2)?.message).toBe(DROPPED);
    expect(kept.length + droppedIn(records)).toBe(100);
    expect(records.at(-1)?.message).toBe('after');
  });

  it('reports records dropped by a burst when the sink closes before the file drains', async () => {
    const path = dir.file('logs/main.log');
    const sink = new FileLogSink(path, { maxBacklogBytes: 512 });
    const at = '2026-11-15T08:00:00.000Z';

    for (let index = 0; index < 100; index += 1) {
      sink.write({ at, level: 'info', message: `record-${String(index)}`, context: {} });
    }
    await sink.close();

    const records = (await readFile(path, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as WrittenRecord);
    const kept = records.filter((record) => record.message.startsWith('record-'));
    expect(records.at(-1)?.message).toBe(DROPPED);
    expect(kept.length + droppedIn(records)).toBe(100);
  });

  it('drops a single record larger than the backlog limit and keeps logging', async () => {
    const path = dir.file('logs/main.log');
    const sink = new FileLogSink(path, { maxBacklogBytes: 512 });
    const at = '2026-11-15T08:00:00.000Z';

    sink.write({ at, level: 'info', message: 'x'.repeat(2_000), context: {} });
    sink.write({ at, level: 'info', message: 'after', context: {} });
    await sink.close();

    const records = (await readFile(path, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as WrittenRecord);
    expect(records.map((record) => [record.message, record.context.dropped])).toEqual([
      [DROPPED, 1],
      ['after', undefined],
    ]);
  });
});
