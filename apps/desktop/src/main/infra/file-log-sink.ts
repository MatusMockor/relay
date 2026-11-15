import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import type { LogRecord, LogSink } from './log-sink';

const serializeValue = (_key: string, value: unknown): unknown => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (!(value instanceof Error)) {
    return value;
  }
  return { name: value.name, message: value.message, stack: value.stack };
};

const withoutRepeats = (): ((key: string, value: unknown) => unknown) => {
  const seen = new WeakSet<object>();
  return (key, value) => {
    const serialized = serializeValue(key, value);
    if (typeof serialized !== 'object' || serialized === null) {
      return serialized;
    }
    if (seen.has(serialized)) {
      return '[Circular]';
    }
    seen.add(serialized);
    return serialized;
  };
};

const formatWithoutRepeats = (record: LogRecord): string => {
  try {
    return JSON.stringify(record, withoutRepeats());
  } catch {
    return JSON.stringify({ ...record, context: { unserializable: true } });
  }
};

const formatRecord = (record: LogRecord): string => {
  try {
    return JSON.stringify(record, serializeValue);
  } catch {
    return formatWithoutRepeats(record);
  }
};

export interface FileLogSinkOptions {
  readonly maxBacklogBytes?: number;
}

const DEFAULT_MAX_BACKLOG_BYTES = 4 * 1024 * 1024;
const DEFAULT_HIGH_WATER_MARK = 16 * 1024;

export class FileLogSink implements LogSink {
  private readonly stream: WriteStream;
  private readonly maxBacklogBytes: number;
  private broken = false;
  private dropped = 0;
  private lastDroppedAt = '';

  constructor(path: string, options: FileLogSinkOptions = {}) {
    this.maxBacklogBytes = options.maxBacklogBytes ?? DEFAULT_MAX_BACKLOG_BYTES;
    mkdirSync(dirname(path), { recursive: true });
    this.stream = createWriteStream(path, {
      flags: 'a',
      mode: 0o600,
      highWaterMark: Math.min(DEFAULT_HIGH_WATER_MARK, this.maxBacklogBytes),
    });
    this.stream.on('error', (error) => {
      this.broken = true;
      console.error('Relay log file is not writable, file logging disabled', error);
    });
    this.stream.on('drain', () => {
      this.reportDropped();
    });
  }

  write(record: LogRecord): void {
    if (this.broken) {
      return;
    }
    if (this.dropped > 0 && this.stream.writableNeedDrain) {
      this.drop(record);
      return;
    }
    this.reportDropped();
    const line = `${formatRecord(record)}\n`;
    if (this.stream.writableLength + Buffer.byteLength(line) > this.maxBacklogBytes) {
      this.drop(record);
      return;
    }
    this.stream.write(line);
  }

  close(): Promise<void> {
    this.reportDropped();
    return new Promise((resolve) => {
      this.stream.end(resolve);
    });
  }

  private drop(record: LogRecord): void {
    this.dropped += 1;
    this.lastDroppedAt = record.at;
  }

  private reportDropped(): void {
    if (this.dropped === 0 || this.broken) {
      return;
    }
    const notice: LogRecord = {
      at: this.lastDroppedAt,
      level: 'warn',
      message: 'Log records dropped while the log file was busy',
      context: { dropped: this.dropped },
    };
    this.dropped = 0;
    this.stream.write(`${formatRecord(notice)}\n`);
  }
}
