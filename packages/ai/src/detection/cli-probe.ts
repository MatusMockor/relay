import type { AiRunnerKind } from '@relay/shared/domain';
import type { CliAuthState } from './cli-detection';
import type { ProbeResult } from './probe-command';

export interface AuthVerdict {
  readonly authenticated: CliAuthState;
  readonly detail: string | null;
}

export interface CliProbe {
  readonly runner: AiRunnerKind;
  readonly executableName: string;
  readonly versionArgs: readonly string[];
  readonly authArgs: readonly string[];
  parseAuth(result: ProbeResult): AuthVerdict;
}

const VERSION_PATTERN = /\d+\.\d+\.\d+[\w.+-]*/;

export function parseVersion(output: string): string | null {
  return VERSION_PATTERN.exec(output)?.[0] ?? null;
}

export function firstLine(output: string): string | null {
  const line = output.split('\n').find((candidate) => candidate.trim().length > 0);
  return line === undefined ? null : line.trim().slice(0, 300);
}
