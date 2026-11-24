import { MESSAGE_PENDING_KINDS, type MessagePendingKind } from '@relay/engine';

export type ColumnMerge =
  | 'placements'
  | 'keeper-labels'
  | 'aliases'
  | 'insert-or-ignore'
  | 'update'
  | 'update-unless-colliding';

export type JsonRewrite = 'ai-job-input' | 'ai-output' | 'activity-actions';

export interface ColumnReference {
  readonly table: string;
  readonly column: string;
  readonly merge: ColumnMerge;
}

export interface JsonReference {
  readonly table: string;
  readonly column: string;
  readonly paths: readonly string[];
  readonly rewrite: JsonRewrite;
}

export interface PendingWorkReference {
  readonly table: 'pending_work';
  readonly refColumn: 'ref';
  readonly payloadColumn: 'payload';
  readonly kinds: readonly MessagePendingKind[];
}

export interface IgnoredColumn {
  readonly table: string;
  readonly column: string;
  readonly reason: string;
}

export const MESSAGE_COLUMN_REFERENCES: readonly ColumnReference[] = [
  { table: 'message_placements', column: 'message_id', merge: 'placements' },
  { table: 'message_labels', column: 'message_id', merge: 'keeper-labels' },
  { table: 'message_aliases', column: 'message_id', merge: 'aliases' },
  { table: 'message_aliases', column: 'alias_id', merge: 'aliases' },
  { table: 'automation_runs', column: 'message_id', merge: 'insert-or-ignore' },
  { table: 'drafts', column: 'in_reply_to_message_id', merge: 'update' },
  { table: 'calendar_events', column: 'message_id', merge: 'update' },
  { table: 'ai_results', column: 'source_message_id', merge: 'update' },
  { table: 'automation_activity', column: 'message_id', merge: 'update' },
  { table: 'ai_jobs', column: 'source_message_id', merge: 'update-unless-colliding' },
];

export const MESSAGE_JSON_REFERENCES: readonly JsonReference[] = [
  {
    table: 'ai_jobs',
    column: 'input',
    paths: ['$.sourceMessageId', '$.messageId'],
    rewrite: 'ai-job-input',
  },
  { table: 'ai_jobs', column: 'output', paths: ['$.messageId'], rewrite: 'ai-output' },
  { table: 'ai_results', column: 'output', paths: ['$.messageId'], rewrite: 'ai-output' },
  {
    table: 'automation_activity',
    column: 'actions',
    paths: ['$[*].changed[*]', '$[*].labelled[*]', '$[*].origins[*].messageId'],
    rewrite: 'activity-actions',
  },
];

export const MESSAGE_PENDING_WORK_REFERENCE: PendingWorkReference = {
  table: 'pending_work',
  refColumn: 'ref',
  payloadColumn: 'payload',
  kinds: MESSAGE_PENDING_KINDS,
};

export const IGNORED_MESSAGE_COLUMNS: readonly IgnoredColumn[] = [
  { table: 'messages', column: 'message_id_header', reason: 'RFC 5322 Message-ID header value' },
];
