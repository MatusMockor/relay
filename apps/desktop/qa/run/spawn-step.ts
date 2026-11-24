import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

export interface StepOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}

const FORWARDED: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

export const runStep = (
  command: string,
  args: readonly string[],
  options: StepOptions,
): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: 'inherit',
    });
    const forward = (signal: NodeJS.Signals) => {
      child.kill(signal);
    };
    FORWARDED.forEach((signal) => process.on(signal, forward));
    const detach = () => {
      FORWARDED.forEach((signal) => process.off(signal, forward));
    };
    child.on('error', (error) => {
      detach();
      reject(error);
    });
    child.on('close', (code, signal) => {
      detach();
      resolve(code ?? (signal === null ? 1 : 128));
    });
  });

export const runRequiredStep = async (
  command: string,
  args: readonly string[],
  options: StepOptions,
): Promise<void> => {
  const code = await runStep(command, args, options);
  assert.equal(code, 0, `${command} ${args.join(' ')} exited with ${String(code)}`);
};
