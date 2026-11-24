import type {
  AiJobInput,
  AiOutput,
  AutomationActivityAction,
  AutomationId,
  ThreadId,
} from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { messageIdRemapOf, remapActivityActions, remapAiJobInput, remapAiOutput } from '../../src';
import { KEEPER, LOSER, OTHER } from '../support/merge-fixtures';

const remap = messageIdRemapOf(new Map([[LOSER, KEEPER]]));
const threadId = 'thr_json' as ThreadId;
const automationId = 'aut_json' as AutomationId;

const action = (overrides: Partial<AutomationActivityAction>): AutomationActivityAction => ({
  action: { type: 'archive' },
  outcome: 'ok',
  changed: [],
  previousState: null,
  origins: [],
  labelled: [],
  reminder: null,
  undo: null,
  reason: null,
  ...overrides,
});

describe('message ids inside JSON on merge', () => {
  it('rewrites the source and target message ids of AI job input', () => {
    const summary: AiJobInput = { kind: 'summary', threadId, sourceMessageId: LOSER };
    const draft: AiJobInput = {
      kind: 'automationDraft',
      threadId,
      messageId: LOSER,
      automationId,
      instructions: null,
    };
    const unsourced: AiJobInput = { kind: 'oneLiner', threadId, sourceMessageId: null };

    expect(remapAiJobInput(summary, remap)).toEqual({ ...summary, sourceMessageId: KEEPER });
    expect(remapAiJobInput(draft, remap)).toEqual({ ...draft, messageId: KEEPER });
    expect(remapAiJobInput(unsourced, remap)).toBe(unsourced);
  });

  it('rewrites the message id of an automation draft output only', () => {
    const draft: AiOutput = { kind: 'automationDraft', threadId, messageId: LOSER, body: 'Ahoj' };
    const oneLiner: AiOutput = { kind: 'oneLiner', text: 'Faktúra' };

    expect(remapAiOutput(draft, remap)).toEqual({ ...draft, messageId: KEEPER });
    expect(remapAiOutput(oneLiner, remap)).toBe(oneLiner);
  });

  it('rewrites activity arrays and removes the duplicates the merge creates', () => {
    const actions = [
      action({
        changed: [KEEPER, LOSER, OTHER],
        labelled: [LOSER, KEEPER],
        origins: [
          { messageId: KEEPER, revision: 'r1' },
          { messageId: LOSER, revision: 'r1' },
          { messageId: LOSER, revision: 'r2' },
        ],
      }),
    ];

    expect(remapActivityActions(actions, remap)).toEqual([
      action({
        changed: [KEEPER, OTHER],
        labelled: [KEEPER],
        origins: [
          { messageId: KEEPER, revision: 'r1' },
          { messageId: KEEPER, revision: 'r2' },
        ],
      }),
    ]);
  });
});
