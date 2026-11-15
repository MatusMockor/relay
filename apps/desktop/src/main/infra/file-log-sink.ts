import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import type { LogRecord, LogSink } from './log-sink';

const serializeError = (_key: string, value: unknown): unknown => {
  if (!(value instanceof Error)) {
    return value;
  }
  return { name: value.name, message: value.message, stack: value.stack };
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
    this.stream.write(`${JSON.stringify(record, serializeError)}\n`);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.stream.end(resolve);
    });
  }
}
