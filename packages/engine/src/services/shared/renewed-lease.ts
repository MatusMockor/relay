import { LeaseLostError } from '../../errors';
import type { LogContext, Logger } from '../../ports/logger';
import { errorMessage } from './mail-provider-sessions';

export interface LeaseRenewal {
  readonly intervalMs: number;
  renew(): Promise<boolean>;
}

export interface HeldLease {
  readonly signal: AbortSignal;
  ensureHeld(): Promise<void>;
}

export class RenewedLease implements HeldLease {
  private readonly controller = new AbortController();
  private pending: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly renewal: LeaseRenewal,
    private readonly logger: Logger,
    private readonly context: LogContext,
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  beat(): Promise<void> {
    if (this.stopped || this.signal.aborted) {
      return Promise.resolve();
    }
    return this.pending ?? this.serialize(this.renewal.renew(), true);
  }

  async ensureHeld(): Promise<void> {
    while (this.pending !== null) {
      await this.pending;
    }
    if (!this.signal.aborted) {
      const renewed = this.renewal.renew();
      await this.serialize(renewed, false);
      await renewed;
    }
    if (this.signal.aborted) {
      throw new LeaseLostError();
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private serialize(renewed: Promise<boolean>, quiet: boolean): Promise<void> {
    const settled = renewed.then(
      (held) => {
        if (!held) {
          this.lose();
        }
      },
      (error: unknown) => {
        if (quiet) {
          this.logger.warn('Renewing a lease failed', {
            ...this.context,
            error: errorMessage(error),
          });
        }
      },
    );
    const current = settled.finally(() => {
      if (this.pending === current) {
        this.pending = null;
      }
    });
    this.pending = current;
    return current;
  }

  private lose(): void {
    if (this.signal.aborted) {
      return;
    }
    this.logger.warn('A lease was lost while its owner was working', this.context);
    this.controller.abort(new LeaseLostError());
  }
}
