import {
  AccountIdSchema,
  type AutomationActivity,
  type AutomationActivityAction,
  AutomationActivityIdSchema,
  AutomationIdSchema,
  LabelIdSchema,
  MailboxIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
} from '@relay/shared';
import { describe, expect, it } from 'vitest';
import type { ActionTargets } from '../src/features/settings/automations/action-targets';
import { historyChipsOf } from '../src/features/settings/automations/history/history-chips';
import {
  undoEntryMessage,
  undoSinceMessage,
} from '../src/features/settings/automations/history/undo-messages';

const targets = (loaded: boolean): ActionTargets => ({
  mailboxes: [],
  labels: [],
  loaded,
  gmail: false,
});

const ran = (
  action: AutomationActivityAction['action'],
  outcome: AutomationActivityAction['outcome'],
): AutomationActivityAction => ({
  action,
  outcome,
  changed: outcome === 'ok' ? [MessageIdSchema.parse('message-1')] : [],
  previousState: 'inbox',
  origins: [],
  undo: null,
});

const entry = (undoneAt: string | null): AutomationActivity => ({
  id: AutomationActivityIdSchema.parse('activity-1'),
  automationId: AutomationIdSchema.parse('automation-1'),
  accountId: AccountIdSchema.parse('acc-1'),
  threadId: ThreadIdSchema.parse('thread-1'),
  messageId: MessageIdSchema.parse('message-1'),
  source: 'live',
  from: null,
  subject: 'Faktúra',
  actions: [ran({ type: 'archive' }, 'ok')],
  createdAt: '2026-11-19T08:00:00.000Z',
  undoneAt,
});

describe('rule history helpers', () => {
  it('labels every action chip and marks failed ones', () => {
    const chips = historyChipsOf(
      [
        ran({ type: 'notify' }, 'ok'),
        ran({ type: 'summary' }, 'ok'),
        ran({ type: 'task' }, 'ok'),
        ran({ type: 'markRead' }, 'ok'),
        ran({ type: 'pin' }, 'ok'),
        ran({ type: 'archive' }, 'failed'),
        ran({ type: 'addLabel', labelId: LabelIdSchema.parse('l1') }, 'ok'),
        ran({ type: 'moveTo', mailboxId: MailboxIdSchema.parse('m1') }, 'ok'),
      ],
      targets(true),
    );

    expect(chips.map(({ label, failed }) => [label, failed])).toEqual([
      ['notifikácia', false],
      ['AI zhrnutie', false],
      ['úloha', false],
      ['označené ako prečítané', false],
      ['pripnuté', false],
      ['archivované', true],
      ['štítok už neexistuje', false],
      ['priečinok už neexistuje', false],
    ]);
  });

  it('keeps neutral target chips while the targets load', () => {
    const chips = historyChipsOf(
      [ran({ type: 'addLabel', labelId: LabelIdSchema.parse('l1') }, 'ok')],
      targets(false),
    );

    expect(chips[0]?.label).toBe('štítok');
  });

  it('describes undo results', () => {
    const undone = entry('2026-11-19T09:00:00.000Z');
    const skipped = { action: { type: 'archive' }, outcome: 'skipped' } as const;

    expect(undoEntryMessage({ entry: undone, alreadyUndone: false, results: [] })).toBe('Vrátené');
    expect(undoEntryMessage({ entry: undone, alreadyUndone: false, results: [skipped] })).toContain(
      'preskočili',
    );
    expect(undoEntryMessage({ entry: entry(null), alreadyUndone: false, results: [] })).toBe(
      'Toto spustenie sa nedá vrátiť',
    );
    expect(undoEntryMessage({ entry: undone, alreadyUndone: true, results: [] })).toBe(
      'Toto spustenie už bolo vrátené',
    );
    expect(undoSinceMessage({ entries: 0, undone: 0, failed: 0 })).toBe('Dnes nie je čo vrátiť');
    expect(undoSinceMessage({ entries: 3, undone: 2, failed: 1 })).toBe(
      'Vrátené spustenia: 2. Nepodarilo sa vrátiť: 1',
    );
  });
});
