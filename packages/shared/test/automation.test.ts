import { describe, expect, it } from 'vitest';
import { CreateAiJobBodySchema, ReplaceAutomationsBodySchema } from '../src/api';
import { AI_MODEL_CATALOG, AutomationSchema, defaultAiModel, effortsFor } from '../src/domain';

const rule = (ai: Record<string, unknown>, actions: unknown[] = [{ type: 'task' }]) => ({
  automations: [
    {
      accountId: null,
      name: 'Od Tibora',
      enabled: true,
      order: 0,
      conditions: [{ type: 'jiraEvent', kind: 'mention' }],
      ai: { runner: 'claude', model: null, effort: null, instructions: null, ...ai },
      actions,
    },
  ],
});

describe('AI model catalog', () => {
  it('lists the models of every runner with one default', () => {
    expect(AI_MODEL_CATALOG.claude.map((model) => model.id)).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ]);
    expect(defaultAiModel('codex').id).toBe('gpt-6.1-sol');
    expect(effortsFor('codex', null)).not.toContain('max');
    expect(effortsFor('claude', 'claude-haiku-5-5')).toContain('max');
  });
});

describe('automation schemas', () => {
  it('accepts catalog models and their efforts', () => {
    expect(
      ReplaceAutomationsBodySchema.safeParse(
        rule({ runner: 'codex', model: 'gpt-6-luna', effort: 'xhigh' }),
      ).success,
    ).toBe(true);
    expect(ReplaceAutomationsBodySchema.safeParse(rule({})).success).toBe(true);
  });

  it('rejects unknown models, unsupported efforts and duplicate actions', () => {
    expect(ReplaceAutomationsBodySchema.safeParse(rule({ model: 'gpt-6-luna' })).success).toBe(
      false,
    );
    expect(
      ReplaceAutomationsBodySchema.safeParse(rule({ runner: 'codex', effort: 'max' })).success,
    ).toBe(false);
    expect(ReplaceAutomationsBodySchema.safeParse(rule({}, ['task', 'task'])).success).toBe(false);
    expect(ReplaceAutomationsBodySchema.safeParse(rule({}, [])).success).toBe(false);
  });

  it('reads legacy string actions as objects', () => {
    const parsed = ReplaceAutomationsBodySchema.parse(rule({}, ['summary', 'archive']));

    expect(parsed.automations[0]?.actions).toEqual([{ type: 'summary' }, { type: 'archive' }]);
  });

  it('accepts parameterized move and label actions', () => {
    const parsed = ReplaceAutomationsBodySchema.safeParse(
      rule({}, [
        { type: 'moveTo', mailboxId: 'mbx_1' },
        { type: 'addLabel', labelId: 'lbl_1' },
        { type: 'addLabel', labelId: 'lbl_2' },
        'markRead',
      ]),
    );

    expect(parsed.success).toBe(true);
  });

  it.each([
    [
      'the same label twice',
      [
        { type: 'addLabel', labelId: 'lbl_1' },
        { type: 'addLabel', labelId: 'lbl_1' },
      ],
    ],
    [
      'two moves',
      [
        { type: 'moveTo', mailboxId: 'mbx_1' },
        { type: 'moveTo', mailboxId: 'mbx_2' },
      ],
    ],
    ['move with archive', [{ type: 'moveTo', mailboxId: 'mbx_1' }, { type: 'archive' }]],
    ['a move without a target', [{ type: 'moveTo' }]],
    ['an unknown action', [{ type: 'forward' }]],
  ])('rejects %s', (_name, actions) => {
    expect(ReplaceAutomationsBodySchema.safeParse(rule({}, actions)).success).toBe(false);
  });

  it('accepts recipient and attachment conditions', () => {
    const body = rule({});
    const conditions = [
      { type: 'recipient', field: 'cc', match: 'domain', value: 'efabrica.sk' },
      { type: 'hasAttachment' },
    ];
    const parsed = ReplaceAutomationsBodySchema.safeParse({
      automations: body.automations.map((item) => ({ ...item, conditions })),
    });

    expect(parsed.success).toBe(true);
  });

  it('keeps stored automations strict about action objects', () => {
    const [input] = rule({}).automations;
    const stored = { ...input, id: 'automation_1', userId: 'user_1', preset: null };

    expect(AutomationSchema.safeParse(stored).success).toBe(true);
    expect(AutomationSchema.safeParse({ ...stored, actions: ['task'] }).success).toBe(false);
  });

  it('validates the model of an AI job against its runner', () => {
    const input = { kind: 'summary', threadId: 'thr_1' };
    expect(
      CreateAiJobBodySchema.safeParse({ input, runner: 'claude', model: 'claude-sonnet-5-5' })
        .success,
    ).toBe(true);
    expect(CreateAiJobBodySchema.safeParse({ input, model: 'claude-sonnet-5-5' }).success).toBe(
      false,
    );
    expect(CreateAiJobBodySchema.safeParse({ input, runner: 'codex', model: 'opus' }).success).toBe(
      false,
    );
  });
});
