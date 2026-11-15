import { dirname, delimiter } from 'node:path';
import { execa, type Result, type ResultPromise } from 'execa';
import type { CliExit, CliExitReason, CliInvocation, CliLauncher, CliProcess } from './cli-process';
import { ownsProcessGroup, reapProcessGroup } from './process-group';

const FORCE_KILL_AFTER_MS = 2_000;
const MAX_STDERR_CHARS = 20_000;

export class ExecaCliLauncher implements CliLauncher {
  launch(invocation: CliInvocation): CliProcess {
    const subprocess = execa(invocation.executable, [...invocation.args], {
      input: invocation.stdin,
      cwd: invocation.cwd,
      env: withExecutableOnPath(invocation),
      extendEnv: true,
      timeout: invocation.timeoutMs,
      cancelSignal: invocation.signal ?? undefined,
      forceKillAfterDelay: FORCE_KILL_AFTER_MS,
      detached: ownsProcessGroup(),
      reject: false,
      buffer: { stdout: false, stderr: true },
    });
    subprocess.once('exit', () => {
      reapProcessGroup(subprocess.pid, FORCE_KILL_AFTER_MS);
    });
    return { lines: readLines(subprocess), exit: subprocess.then(toExit) };
  }
}

function withExecutableOnPath(invocation: CliInvocation): Record<string, string> {
  const currentPath = invocation.env.PATH ?? process.env.PATH ?? '';
  return { ...invocation.env, PATH: [dirname(invocation.executable), currentPath].join(delimiter) };
}

async function* readLines(subprocess: ResultPromise): AsyncGenerator<string> {
  const iterator = subprocess.iterable({ from: 'stdout' })[Symbol.asyncIterator]();
  let drained = false;
  try {
    for (;;) {
      const next = await iterator.next();
      if (next.done === true) {
        drained = true;
        return;
      }
      yield String(next.value);
    }
  } catch (_error) {
    drained = true;
    return;
  } finally {
    if (!drained) {
      subprocess.kill();
      void iterator.return?.().catch(() => undefined);
    }
  }
}

function toExit(result: Result): CliExit {
  const stderr = String(result.stderr ?? '').slice(-MAX_STDERR_CHARS);
  return {
    reason: exitReason(result),
    exitCode: result.exitCode ?? null,
    stderr,
    message: result.failed ? (result.shortMessage ?? '') : '',
  };
}

function exitReason(result: Result): CliExitReason {
  if (result.isCanceled) {
    return 'cancelled';
  }
  if (result.timedOut) {
    return 'timeout';
  }
  if (result.code === 'ENOENT' || result.code === 'EACCES') {
    return 'not_found';
  }
  if (result.failed && result.exitCode === undefined && result.signal === undefined) {
    return 'spawn_failed';
  }
  return 'exited';
}
