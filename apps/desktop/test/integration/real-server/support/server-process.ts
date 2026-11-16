import { spawn } from 'node:child_process';
import { SERVER_DIR, SERVER_ENTRY, VITE_NODE_BIN } from './server-paths';

export interface ServerProcess {
  readonly pid: number | undefined;
  hasExited(): boolean;
  logs(): string;
  stop(): Promise<void>;
}

const LOG_LINES = 300;
const STOP_GRACE_MS = 10_000;

export const spawnServerProcess = (env: NodeJS.ProcessEnv): ServerProcess => {
  const child = spawn(process.execPath, [VITE_NODE_BIN, SERVER_ENTRY], {
    cwd: SERVER_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines: string[] = [];
  const collect = (chunk: Buffer): void => {
    lines.push(
      ...chunk
        .toString('utf8')
        .split('\n')
        .filter((line) => line.length > 0),
    );
    lines.splice(0, Math.max(0, lines.length - LOG_LINES));
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  let exited = false;
  const killOnExit = (): void => {
    child.kill('SIGKILL');
  };
  process.once('exit', killOnExit);
  const exit = new Promise<void>((resolve) => {
    const settle = (): void => {
      exited = true;
      process.off('exit', killOnExit);
      resolve();
    };
    child.once('exit', settle);
    child.once('error', (error) => {
      lines.push(`spawn failed: ${error.message}`);
      settle();
    });
  });
  return {
    pid: child.pid,
    hasExited: () => exited,
    logs: () => lines.join('\n'),
    stop: async () => {
      if (exited) {
        return;
      }
      child.kill('SIGTERM');
      const force = setTimeout(() => {
        child.kill('SIGKILL');
      }, STOP_GRACE_MS);
      await exit;
      clearTimeout(force);
    },
  };
};
