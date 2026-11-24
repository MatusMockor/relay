import { type MessageIdRemap, type MergeMapping } from '@relay/engine';
import type { RelayDb } from '../../database/sqlite-database';
import { refreshPrimaryMirror } from '../primary-mirror';
import { aliasLosers, deleteLosers } from './merge-aliases';
import { remapColumnReferences } from './merge-column-references';
import { mergeKeeperContent } from './merge-content';
import { rewriteJsonReferences } from './merge-json-references';
import { applyPendingOverrides } from './merge-pending-overrides';
import { remapMemberPendingWork } from './merge-pending-work';
import { mergePlacements } from './merge-placements';

export interface MergeContext {
  readonly db: RelayDb;
  readonly accountId: string;
  readonly mapping: MergeMapping;
  readonly remap: MessageIdRemap;
  readonly keeperIds: readonly string[];
}

export interface MergeStep {
  readonly name: string;
  readonly run: (context: MergeContext) => void;
}

export type MergeStepObserver = (step: string, ms: number) => void;

export const MERGE_STEPS: readonly MergeStep[] = [
  {
    name: 'content',
    run: ({ db }) => {
      mergeKeeperContent(db);
    },
  },
  {
    name: 'placements',
    run: ({ db }) => {
      mergePlacements(db);
    },
  },
  {
    name: 'columns',
    run: ({ db }) => {
      remapColumnReferences(db);
    },
  },
  {
    name: 'json',
    run: ({ db, remap }) => {
      rewriteJsonReferences(db, remap);
    },
  },
  {
    name: 'pending-work',
    run: ({ db, accountId, mapping }) => {
      remapMemberPendingWork(db, accountId, mapping);
    },
  },
  {
    name: 'overrides',
    run: ({ db, accountId }) => {
      applyPendingOverrides(db, accountId);
    },
  },
  {
    name: 'aliases',
    run: ({ db }) => {
      aliasLosers(db);
    },
  },
  {
    name: 'delete',
    run: ({ db }) => {
      deleteLosers(db);
    },
  },
  {
    name: 'mirror',
    run: ({ db, keeperIds }) => {
      refreshPrimaryMirror(db, keeperIds);
    },
  },
];
