import type { AiRunnerKind } from '@relay/shared/domain';
import { claudeProbe } from './claude-probe';
import type { CliDetection } from './cli-detection';
import { CliLocator } from './cli-locator';
import { parseVersion, type CliProbe } from './cli-probe';
import { codexProbe } from './codex-probe';
import { runProbe } from './probe-command';

export interface CliDetectorOptions {
  readonly locator?: CliLocator;
  readonly probes?: readonly CliProbe[];
  readonly versionTimeoutMs?: number;
  readonly authTimeoutMs?: number;
}

export class CliDetector {
  private readonly locator: CliLocator;
  private readonly probes: ReadonlyMap<AiRunnerKind, CliProbe>;
  private readonly versionTimeoutMs: number;
  private readonly authTimeoutMs: number;

  constructor(options: CliDetectorOptions = {}) {
    this.locator = options.locator ?? new CliLocator();
    const probes = options.probes ?? [claudeProbe, codexProbe];
    this.probes = new Map(probes.map((probe) => [probe.runner, probe]));
    this.versionTimeoutMs = options.versionTimeoutMs ?? 5_000;
    this.authTimeoutMs = options.authTimeoutMs ?? 10_000;
  }

  async locate(runner: AiRunnerKind): Promise<string | null> {
    const probe = this.probes.get(runner);
    if (probe === undefined) {
      return null;
    }
    return this.locator.locate(probe.executableName);
  }

  async detectAll(): Promise<CliDetection[]> {
    return Promise.all([...this.probes.keys()].map((runner) => this.detect(runner)));
  }

  async detect(runner: AiRunnerKind): Promise<CliDetection> {
    const probe = this.probes.get(runner);
    const path = await this.locate(runner);
    if (probe === undefined || path === null) {
      return notInstalled(runner);
    }
    const [version, auth] = await Promise.all([
      runProbe(path, probe.versionArgs, this.versionTimeoutMs),
      runProbe(path, probe.authArgs, this.authTimeoutMs),
    ]);
    const verdict = probe.parseAuth(auth);
    return {
      runner,
      installed: true,
      version: version.ok ? parseVersion(version.output) : null,
      path,
      authenticated: verdict.authenticated,
      detail: verdict.detail,
    };
  }
}

function notInstalled(runner: AiRunnerKind): CliDetection {
  return {
    runner,
    installed: false,
    version: null,
    path: null,
    authenticated: 'unknown',
    detail: `${runner} CLI not found on PATH`,
  };
}
