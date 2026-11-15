import type { AiRunnerInfo, AiRunnerKind, AiRunnerLocation } from '@relay/shared/domain';

export type CliAuthState = true | false | 'unknown';

export interface CliDetection {
  readonly runner: AiRunnerKind;
  readonly installed: boolean;
  readonly version: string | null;
  readonly path: string | null;
  readonly authenticated: CliAuthState;
  readonly detail: string | null;
}

export function toRunnerInfo(detection: CliDetection, location: AiRunnerLocation): AiRunnerInfo {
  return {
    runner: detection.runner,
    location,
    installed: detection.installed,
    authenticated: detection.authenticated === 'unknown' ? null : detection.authenticated,
    version: detection.version,
    executablePath: detection.path,
  };
}
