export interface BackoffPolicy {
  readonly initialMs: number;
  readonly maxMs: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = { initialMs: 1_000, maxMs: 60_000 };

export const backoffDelay = (policy: BackoffPolicy, attempt: number): number =>
  Math.min(policy.maxMs, policy.initialMs * 2 ** Math.max(0, attempt - 1));
