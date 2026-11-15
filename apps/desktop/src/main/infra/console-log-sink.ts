import type { LogRecord, LogSink } from './log-sink';

export const consoleLogSink: LogSink = {
  write: (record: LogRecord) => {
    const line = `[${record.level}] ${record.message}`;
    if (record.level === 'error' || record.level === 'warn') {
      console.error(line, record.context);
      return;
    }
    console.log(line, record.context);
  },
};
