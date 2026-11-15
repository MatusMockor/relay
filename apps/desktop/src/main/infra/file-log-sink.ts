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

export class FileLogSink implements LogSink {
  private readonly stream: WriteStream;
  private broken = false;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.stream = createWriteStream(path, { flags: 'a', mode: 0o600 });
    this.stream.on('error', (error) => {
      this.broken = true;
      console.error('Relay log file is not writable, file logging disabled', error);
    });
  }

  write(record: LogRecord): void {
    if (this.broken) {
      return;
    }
    this.stream.write(`${formatRecord(record)}\n`);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.stream.end(resolve);
    });
  }
}
