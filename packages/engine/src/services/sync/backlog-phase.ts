import type { MailboxId } from '@relay/shared/domain';
import type { SyncStage } from '@relay/shared/realtime';
import type { MailboxWindow } from './initial-window';

export interface BacklogPhase {
  readonly stage: SyncStage;
  readonly counted: ReadonlySet<MailboxId> | null;
  readonly holdSubjectReplies: boolean;
  readonly emitWhenEmpty: boolean;
}

export const SINGLE_PHASE: BacklogPhase = {
  stage: 'backlog',
  counted: null,
  holdSubjectReplies: false,
  emitWhenEmpty: true,
};

export const primaryPhase = (deferring: boolean): BacklogPhase => ({
  ...SINGLE_PHASE,
  holdSubjectReplies: deferring,
});

export const deferredPhase = (windows: readonly MailboxWindow[]): BacklogPhase => ({
  stage: 'folders',
  counted: new Set(windows.map((window) => window.pass.mailbox.id)),
  holdSubjectReplies: false,
  emitWhenEmpty: false,
});
