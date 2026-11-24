import type { MergeReport } from '../../../model/message-merge';

export interface CopyMergeProgress {
  resolved: number;
  merged: number;
  spanning: number;
  conflicts: number;
  chunks: number;
  slowestChunkMs: number;
}

export const emptyProgress = (): CopyMergeProgress => ({
  resolved: 0,
  merged: 0,
  spanning: 0,
  conflicts: 0,
  chunks: 0,
  slowestChunkMs: 0,
});

export const recordChunk = (progress: CopyMergeProgress, report: MergeReport, ms: number) => {
  progress.merged += report.merged.length;
  progress.spanning += report.skipped['spans-threads'];
  progress.conflicts += report.skipped['mailbox-conflict'];
  progress.chunks += 1;
  progress.slowestChunkMs = Math.max(progress.slowestChunkMs, ms);
};

export const madeProgress = (progress: CopyMergeProgress): boolean =>
  progress.resolved > 0 || progress.chunks > 0;
