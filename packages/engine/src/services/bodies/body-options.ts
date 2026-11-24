export interface BodyOptions {
  readonly cacheBytes: number;
  readonly cacheEntries: number;
  readonly cacheTtlMs: number;
  readonly sessionIdleMs: number;
}

export const DEFAULT_BODY_OPTIONS: BodyOptions = {
  cacheBytes: 20 * 1024 * 1024,
  cacheEntries: 100,
  cacheTtlMs: 10 * 60_000,
  sessionIdleMs: 60_000,
};
