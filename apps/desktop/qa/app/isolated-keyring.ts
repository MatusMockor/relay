import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { chmod, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QA_SESSION_MARKER, readQaEnv } from '../config/qa-env';

const KEYRING_PASSWORD = 'relay-qa';
const EXPORTED = /^([A-Z_]+)=(.*)$/;

const assertPrivateBus = (): void => {
  assert.equal(
    readQaEnv().QA_SESSION,
    QA_SESSION_MARKER,
    'The QA keyring needs the private D-Bus session of the QA runner. Start scenarios with `pnpm --filter @relay/desktop qa <scenario>`.',
  );
};

const exportedVariables = (output: string): Record<string, string> =>
  Object.fromEntries(
    output
      .split('\n')
      .map((line) => EXPORTED.exec(line.trim()))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? '', match[2] ?? '']),
  );

const runDaemon = (env: NodeJS.ProcessEnv): Promise<string> =>
  new Promise((resolve, reject) => {
    const daemon = spawn(
      'gnome-keyring-daemon',
      ['--unlock', '--components=secrets', '--daemonize'],
      { env, stdio: ['pipe', 'pipe', 'inherit'] },
    );
    let output = '';
    daemon.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    daemon.on('error', reject);
    daemon.on('close', (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(
        new assert.AssertionError({ message: `gnome-keyring-daemon exited with ${String(code)}` }),
      );
    });
    daemon.stdin.end(KEYRING_PASSWORD);
  });

const startKeyring = async (): Promise<Record<string, string>> => {
  assertPrivateBus();
  const root = await mkdtemp(join(tmpdir(), 'relay-qa-keyring-'));
  process.once('exit', () => {
    rmSync(root, { recursive: true, force: true });
  });
  const dataHome = join(root, 'data');
  const runtimeDir = join(root, 'runtime');
  await mkdir(dataHome, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await chmod(runtimeDir, 0o700);
  const output = await runDaemon({
    ...process.env,
    XDG_DATA_HOME: dataHome,
    XDG_RUNTIME_DIR: runtimeDir,
  });
  return { XDG_RUNTIME_DIR: runtimeDir, ...exportedVariables(output) };
};

let running: Promise<Record<string, string>> | null = null;

export const isolatedKeyring = (): Promise<Record<string, string>> => {
  running ??= startKeyring();
  return running;
};
