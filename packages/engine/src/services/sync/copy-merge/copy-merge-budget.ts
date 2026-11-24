import type { Clock } from '../../../ports/clock';

export class CopyMergeBudget {
  private readonly deadline: number;

  constructor(
    sliceMs: number,
    private readonly clock: Clock,
  ) {
    this.deadline = clock.now().getTime() + sliceMs;
  }

  expired(): boolean {
    return this.clock.now().getTime() >= this.deadline;
  }
}
