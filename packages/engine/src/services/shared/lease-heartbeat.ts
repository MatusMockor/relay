import type { IntervalTimer } from '../../ports/interval-timer';
import type { LogContext, Logger } from '../../ports/logger';
import { type HeldLease, type LeaseRenewal, RenewedLease } from './renewed-lease';

export interface ActiveLease extends HeldLease {
  stop(): void;
}

export class LeaseHeartbeat {
  constructor(
    private readonly timer: IntervalTimer,
    private readonly logger: Logger,
  ) {}

  start(renewal: LeaseRenewal, context: LogContext): ActiveLease {
    const lease = new RenewedLease(renewal, this.logger, context);
    const cancel = this.timer.repeat(renewal.intervalMs, () => lease.beat());
    return {
      signal: lease.signal,
      ensureHeld: () => lease.ensureHeld(),
      stop: () => {
        cancel();
        lease.stop();
      },
    };
  }

  async hold<Result>(
    renewal: LeaseRenewal,
    context: LogContext,
    work: (lease: HeldLease) => Promise<Result>,
  ): Promise<Result> {
    const lease = this.start(renewal, context);
    try {
      return await work(lease);
    } finally {
      lease.stop();
    }
  }
}
