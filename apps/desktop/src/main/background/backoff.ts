export interface BackoffPolicy {
  readonly initialMs: number;
  readonly maxMs: number;
  readonly factor: number;
}

export const DEFAULT_IDLE_BACKOFF: BackoffPolicy = {
  initialMs: 2_000,
  maxMs: 5 * 60_000,
  factor: 2,
};

export const backoffDelayMs = (policy: BackoffPolicy, attempt: number): number =>
  Math.min(policy.maxMs, policy.initialMs * policy.factor ** Math.max(0, attempt - 1));
