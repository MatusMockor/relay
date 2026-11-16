export interface AttachmentSweepOptions {
  readonly graceMs: number;
  readonly intervalMs: number;
  readonly batchSize: number;
}

export const MIN_ATTACHMENT_SWEEP_GRACE_MS = 60 * 60 * 1000;

export const DEFAULT_ATTACHMENT_SWEEP_OPTIONS: AttachmentSweepOptions = {
  graceMs: 24 * 60 * 60 * 1000,
  intervalMs: 60 * 60 * 1000,
  batchSize: 200,
};

export const attachmentSweepOptions = (
  overrides: Partial<AttachmentSweepOptions> = {},
): AttachmentSweepOptions => {
  const merged = { ...DEFAULT_ATTACHMENT_SWEEP_OPTIONS, ...overrides };
  return {
    graceMs: Math.max(merged.graceMs, MIN_ATTACHMENT_SWEEP_GRACE_MS),
    intervalMs: Math.max(merged.intervalMs, 0),
    batchSize: Math.max(Math.floor(merged.batchSize), 1),
  };
};
