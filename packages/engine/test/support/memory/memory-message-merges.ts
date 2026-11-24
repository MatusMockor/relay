import type {
  EmailIdResolutions,
  MergeChunk,
  MergeReport,
  MessageMerges,
  UnresolvedPlacement,
} from '../../../src';

export class MemoryMessageMerges implements MessageMerges {
  nextGroups(): Promise<MergeChunk> {
    return Promise.resolve({ groups: [], last: null });
  }

  merge(): Promise<MergeReport> {
    return Promise.resolve({ merged: [], skipped: { 'spans-threads': 0, 'mailbox-conflict': 0 } });
  }
}

export class MemoryEmailIdResolutions implements EmailIdResolutions {
  listUnresolved(): Promise<UnresolvedPlacement[]> {
    return Promise.resolve([]);
  }

  fillEmailIds(): Promise<number> {
    return Promise.resolve(0);
  }
}
