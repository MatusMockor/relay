import { createWriteStream } from 'node:fs';
import type { ElectronApplication } from 'playwright';

export const captureAppLog = (
  electron: ElectronApplication,
  logFile: string,
  echo: boolean,
): (() => Promise<void>) => {
  const sink = createWriteStream(logFile, { flags: 'a' });
  const forward = (prefix: string) => (chunk: Buffer) => {
    sink.write(chunk);
    if (echo) {
      process.stderr.write(`${prefix}${chunk.toString('utf8')}`);
    }
  };
  electron.process().stdout?.on('data', forward('[app] '));
  electron.process().stderr?.on('data', forward('[app:err] '));
  return () =>
    new Promise((resolve) => {
      sink.end(resolve);
    });
};
