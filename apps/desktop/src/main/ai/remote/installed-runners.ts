import type { AiRunnerRegistry, Clock } from '@relay/engine';
import type { AiRunnerKind } from '@relay/shared/domain';

const FOUND_TTL_MS = 5 * 60_000;
const MISSING_TTL_MS = 60_000;

export class InstalledRunners {
  private cached: { readonly kinds: AiRunnerKind[]; readonly at: number } | null = null;

  constructor(
    private readonly registry: AiRunnerRegistry,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<AiRunnerKind[]> {
    const now = this.clock.now().getTime();
    if (this.cached !== null && now - this.cached.at < this.ttl(this.cached.kinds)) {
      return this.cached.kinds;
    }
    const detected = await this.registry.detectAll();
    const kinds = detected
      .filter((info) => info.installed && info.authenticated !== false)
      .map((info) => info.runner);
    this.cached = { kinds, at: now };
    return kinds;
  }

  private ttl(kinds: readonly AiRunnerKind[]): number {
    return kinds.length > 0 ? FOUND_TTL_MS : MISSING_TTL_MS;
  }
}
