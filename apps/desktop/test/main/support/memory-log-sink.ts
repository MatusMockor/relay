import { StructuredLogger } from '../../../src/main/infra/structured-logger';
import type { LogRecord, LogSink } from '../../../src/main/infra/log-sink';
import { systemClock } from '../../../src/main/infra/system-clock';

export class MemoryLogSink implements LogSink {
  readonly records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.records.push(record);
  }

  messages(): string[] {
    return this.records.map((record) => record.message);
  }
}

export const createTestLogger = (sink = new MemoryLogSink()) => ({
  sink,
  logger: new StructuredLogger([sink], systemClock, 'debug'),
});
