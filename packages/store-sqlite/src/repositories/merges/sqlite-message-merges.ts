import {
  type MergeChunk,
  type MergeReport,
  type MessageMerges,
  NotImplementedError,
} from '@relay/engine';

export class SqliteMessageMerges implements MessageMerges {
  nextGroups(): Promise<MergeChunk> {
    return Promise.reject(new NotImplementedError('SQLite message merge groups'));
  }

  merge(): Promise<MergeReport> {
    return Promise.reject(new NotImplementedError('SQLite message merges'));
  }
}
