import type { CliExit } from '../process/cli-process';
import type { CliFailure } from './cli-dialect';

export function classifyCliFailure(
  exit: CliExit,
  lastError: string | null,
  authPattern: RegExp,
): CliFailure {
  if (exit.reason === 'not_found') {
    return { code: 'not_installed', message: 'CLI executable not found' };
  }
  if (exit.reason === 'timeout') {
    return { code: 'timeout', message: 'CLI run timed out' };
  }
  if (exit.reason === 'cancelled') {
    return { code: 'cancelled', message: 'CLI run was cancelled' };
  }
  const diagnostics = [lastError, exit.stderr].filter((text) => text !== null && text.length > 0);
  const message = diagnostics.join('\n').trim();
  if (authPattern.test(message)) {
    return { code: 'not_authenticated', message: message.slice(0, 2_000) };
  }
  const fallback =
    exit.message.length > 0 ? exit.message : `CLI exited with code ${String(exit.exitCode)}`;
  return {
    code: 'process_failed',
    message: (message.length > 0 ? message : fallback).slice(0, 2_000),
  };
}
