import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CommandRunner } from './command-runner';

const TIMEOUT_MS = 5_000;

const run = promisify(execFile);

export const execFileRunner: CommandRunner = async (file, args) => {
  await run(file, [...args], { timeout: TIMEOUT_MS });
};
