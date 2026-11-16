import type { AiRunnerLocation } from '@relay/shared/domain';
import type { AiJobClaim } from '../../ports/ai-job-repository';
import type { Clock } from '../../ports/clock';

export class AiJobLease {
  private claims = 0;

  constructor(
    private readonly worker: string,
    private readonly clock: Clock,
    private readonly durationMs: number,
    private readonly location: AiRunnerLocation,
  ) {}

  next(): AiJobClaim {
    this.claims += 1;
    return {
      owner: `${this.worker}:${this.claims}`,
      location: this.location,
      now: this.clock.now().toISOString(),
      leaseUntil: this.until(),
    };
  }

  get renewalMs(): number {
    return this.durationMs / 4;
  }

  until(): string {
    return new Date(this.clock.now().getTime() + this.durationMs).toISOString();
  }
}
