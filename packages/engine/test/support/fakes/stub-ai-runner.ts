import type { AiEvent, AiRunnerInfo, AiRunnerKind } from '@relay/shared/domain';
import type { AiRequest, AiRunner, AiRunnerRegistry } from '../../../src';
import { asyncItems } from '../mail/async-items';

export type AiScript = (request: AiRequest) => readonly AiEvent[];

export class StubAiRunner implements AiRunner {
  readonly requests: AiRequest[] = [];

  constructor(
    readonly kind: AiRunnerKind,
    private script: AiScript,
  ) {}

  respondWith(script: AiScript): void {
    this.script = script;
  }

  detect(): Promise<AiRunnerInfo> {
    return Promise.resolve({
      runner: this.kind,
      location: 'local',
      installed: true,
      authenticated: true,
      version: '1.0.0-stub',
      executablePath: `/usr/local/bin/${this.kind}`,
    });
  }

  run(request: AiRequest): AsyncIterable<AiEvent> {
    this.requests.push(request);
    return asyncItems(this.script(request));
  }
}

export class MemoryAiRunnerRegistry implements AiRunnerRegistry {
  private readonly runners = new Map<AiRunnerKind, AiRunner>();

  register(runner: AiRunner): void {
    this.runners.set(runner.kind, runner);
  }

  get(kind: AiRunnerKind): AiRunner | null {
    return this.runners.get(kind) ?? null;
  }

  list(): AiRunner[] {
    return [...this.runners.values()];
  }

  detectAll(): Promise<AiRunnerInfo[]> {
    return Promise.all(this.list().map((runner) => runner.detect()));
  }
}
