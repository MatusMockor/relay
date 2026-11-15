export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  readonly at: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface LogSink {
  write(record: LogRecord): void;
}
