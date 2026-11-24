import {
  type MergeChunk,
  type MergeReport,
  type MessageMerges,
  NotImplementedError,
} from '@relay/engine';

export class PgMessageMerges implements MessageMerges {
  nextGroups(): Promise<MergeChunk> {
    return Promise.reject(new NotImplementedError('Postgres message merge groups'));
  }

  merge(): Promise<MergeReport> {
    return Promise.reject(new NotImplementedError('Postgres message merges'));
  }
}
