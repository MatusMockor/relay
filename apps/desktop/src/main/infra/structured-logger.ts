import type { Clock, LogContext, Logger } from '@relay/engine';
import type { LogLevel, LogSink } from './log-sink';

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class StructuredLogger implements Logger {
  constructor(
    private readonly sinks: readonly LogSink[],
    private readonly clock: Clock,
    private readonly minLevel: LogLevel = 'info',
    private readonly bindings: LogContext = {},
  ) {}

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  child(bindings: LogContext): Logger {
    return new StructuredLogger(this.sinks, this.clock, this.minLevel, {
      ...this.bindings,
      ...bindings,
    });
  }

  private log(level: LogLevel, message: string, context: LogContext = {}): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) {
      return;
    }
    const record = {
      at: this.clock.now().toISOString(),
      level,
      message,
      context: { ...this.bindings, ...context },
    };
    this.sinks.forEach((sink) => {
      sink.write(record);
    });
  }
}
