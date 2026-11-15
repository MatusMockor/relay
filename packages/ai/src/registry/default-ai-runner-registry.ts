import type { AiRunner, AiRunnerRegistry } from '@relay/engine';
import type { AiRunnerInfo, AiRunnerKind } from '@relay/shared/domain';

export class DefaultAiRunnerRegistry implements AiRunnerRegistry {
  private readonly runners: ReadonlyMap<AiRunnerKind, AiRunner>;

  constructor(runners: readonly AiRunner[]) {
    this.runners = new Map(runners.map((runner) => [runner.kind, runner]));
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
