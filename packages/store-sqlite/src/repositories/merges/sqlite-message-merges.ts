import type { MergeChunk, MergeGroup, MergeReport, MessageMerges } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { SqliteExecutor } from '../../executor/sqlite-executor';
import { mergeChunk } from './merge-chunk';
import { readNextGroups } from './merge-group-keyset';
import type { MergeStepObserver } from './merge-steps';

const EMPTY_REPORT: MergeReport = {
  merged: [],
  skipped: { 'spans-threads': 0, 'mailbox-conflict': 0 },
};

const ignoreSteps: MergeStepObserver = () => undefined;

export class SqliteMessageMerges implements MessageMerges {
  constructor(
    private readonly executor: SqliteExecutor,
    private readonly observe: MergeStepObserver = ignoreSteps,
  ) {}

  nextGroups(accountId: AccountId, after: string | null, maxMessages: number): Promise<MergeChunk> {
    return this.executor.execute((db) => readNextGroups(db, accountId, after, maxMessages));
  }

  merge(accountId: AccountId, groups: readonly MergeGroup[]): Promise<MergeReport> {
    if (groups.length === 0) {
      return Promise.resolve(EMPTY_REPORT);
    }
    return this.executor.execute((db) => mergeChunk(db, accountId, groups, this.observe));
  }
}
