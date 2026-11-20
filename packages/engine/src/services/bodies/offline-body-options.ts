export interface OfflineBodyOptions {
  readonly hydrateMessages: number;
  readonly hydrateBytes: number;
  readonly hydrateFetchBatch: number;
  readonly hydrateBatchBytes: number;
  readonly hydrateMaxMessageBytes: number;
  readonly evictChunk: number;
  readonly evictChunksPerTick: number;
  readonly skipMs: number;
  readonly maxSkips: number;
}

export const DEFAULT_OFFLINE_BODY_OPTIONS: OfflineBodyOptions = {
  hydrateMessages: 50,
  hydrateBytes: 10 * 1024 * 1024,
  hydrateFetchBatch: 10,
  hydrateBatchBytes: 2 * 1024 * 1024,
  hydrateMaxMessageBytes: 10 * 1024 * 1024,
  evictChunk: 200,
  evictChunksPerTick: 10,
  skipMs: 6 * 60 * 60_000,
  maxSkips: 2_000,
};
