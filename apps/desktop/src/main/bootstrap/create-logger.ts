import type { Logger } from '@relay/engine';
import { consoleLogSink } from '../infra/console-log-sink';
import { FileLogSink } from '../infra/file-log-sink';
import type { LogSink } from '../infra/log-sink';
import { StructuredLogger } from '../infra/structured-logger';
import { systemClock } from '../infra/system-clock';

export const createMainLogger = (logFile: string, isPackaged: boolean): Logger => {
  const sinks: LogSink[] = [new FileLogSink(logFile)];
  if (!isPackaged) {
    sinks.push(consoleLogSink);
  }
  return new StructuredLogger(sinks, systemClock, isPackaged ? 'info' : 'debug');
};
