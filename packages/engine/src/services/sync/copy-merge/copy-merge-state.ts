import {
  type CopyMergeResolveCursor,
  type CopyMergeWork,
  FRESH_COPY_MERGE_WORK,
  parseCopyMergeWork,
} from '@relay/shared/domain';
import type { MergeChunk, MergeReport } from '../../../model/message-merge';
import type { PendingWork } from '../../../model/pending-work';

export const COPY_MERGE_REF = 'account';

export type CopyMergeRow = PendingWork<'copy-merge'>;

export const stateOf = (row: CopyMergeRow): CopyMergeWork => parseCopyMergeWork(row.payload);

export const isWaiting = (state: CopyMergeWork, now: Date): boolean =>
  state.retryAfter !== null && Date.parse(state.retryAfter) > now.getTime();

export const resuming = (
  state: CopyMergeWork,
  cursors: readonly CopyMergeResolveCursor[],
): CopyMergeWork => ({ ...state, resolve: [...cursors], retryAfter: null });

export const afterChunk = (
  state: CopyMergeWork,
  chunk: MergeChunk,
  report: MergeReport,
): CopyMergeWork => ({
  ...state,
  afterEmailId: chunk.last,
  pass: {
    merged: state.pass.merged + report.merged.length,
    conflicts: state.pass.conflicts + report.skipped['mailbox-conflict'],
    spanning: state.pass.spanning + report.skipped['spans-threads'],
  },
});

export const retires = (state: CopyMergeWork): boolean =>
  state.pass.merged === 0 && state.pass.conflicts === 0;

export const nextPass = (state: CopyMergeWork, now: Date, retryMs: number): CopyMergeWork => ({
  ...FRESH_COPY_MERGE_WORK,
  retryAfter: state.pass.merged === 0 ? new Date(now.getTime() + retryMs).toISOString() : null,
});
