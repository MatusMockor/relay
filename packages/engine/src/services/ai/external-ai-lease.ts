import type { Clock } from '../../ports/clock';

export const EXTERNAL_AI_LEASE_MS = 120_000;

export interface ExternalAiLease {
  readonly workerId: string;
  readonly leaseId: string;
}

export const externalLeaseOwner = (lease: ExternalAiLease): string =>
  `remote:${lease.workerId}:${lease.leaseId}`;

export const externalLeaseUntil = (clock: Clock, durationMs: number): string =>
  new Date(clock.now().getTime() + durationMs).toISOString();
