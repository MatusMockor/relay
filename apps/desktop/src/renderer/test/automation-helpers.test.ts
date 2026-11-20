import {
  AccountIdSchema,
  AutomationActionsSchema,
  type AutomationCondition,
  AutomationConditionSchema,
  LabelIdSchema,
  MailboxIdSchema,
} from '@relay/shared';
import { describe, expect, it } from 'vitest';
import type { ActionTargets } from '../src/features/settings/automations/action-targets';
import type { RuleInput } from '../src/features/settings/automations/editable-rule';
import { moveRule } from '../src/features/settings/automations/rule-order';
import {
  describeRule,
  summarizeActions,
  summarizeConditions,
  firstAiAction,
} from '../src/features/settings/automations/rule-summary';
import { RULE_TEMPLATES } from '../src/features/settings/automations/rule-templates';

const targets: ActionTargets = { mailboxes: [], labels: [], loaded: false, gmail: false };

const all = (conditions: AutomationCondition[]) => ({
  match: 'all' as const,
  conditions,
  exceptions: [],
});

const draft = (overrides: Partial<RuleInput>): RuleInput => ({
  accountId: null,
  name: 'Faktúry',
  enabled: true,
  order: 0,
  match: 'all',
  conditions: [],
  exceptions: [],
  ai: { runner: 'claude', model: null, effort: null, instructions: null },
  actions: [{ type: 'archive' }],
  ...overrides,
});

describe('automation helpers', () => {
  it('summarizes conditions as one sentence', () => {
    expect(
      summarizeConditions(
        all([
          { type: 'jira', projectKeys: [] },
          { type: 'jiraEvent', kind: 'assigned' },
        ]),
      ),
    ).toBe('Z Jiry a Jira udalosť je Priradenie');
    expect(summarizeConditions(all([]))).toBe('');
    expect(
      summarizeConditions({
        match: 'any',
        conditions: [
          { type: 'fromDomain', domain: 'dodavatel.sk' },
          { type: 'subjectContains', value: 'faktúra' },
        ],
        exceptions: [{ type: 'fromAddress', address: 'noreply@firma.sk' }],
      }),
    ).toBe('Z domény dodavatel.sk alebo predmet obsahuje faktúra, okrem: od noreply@firma.sk');
  });

  it('describes a whole rule as one sentence', () => {
    const labelId = LabelIdSchema.parse('lbl-faktury');
    const known: ActionTargets = {
      ...targets,
      loaded: true,
      labels: [
        {
          id: labelId,
          accountId: AccountIdSchema.parse('acc-1'),
          name: 'Faktúry',
          color: null,
          kind: 'keyword',
          remoteName: 'Faktury',
        },
      ],
    };

    expect(
      describeRule(
        draft({
          match: 'any',
          conditions: [
            { type: 'fromDomain', domain: 'dodavatel.sk' },
            { type: 'fromDomain', domain: 'firma.sk' },
            { type: 'subjectContains', value: 'faktúra' },
          ],
          exceptions: [{ type: 'fromAddress', address: 'noreply@firma.sk' }],
          actions: [{ type: 'addLabel', labelId }, { type: 'archive' }],
        }),
        known,
        null,
      ),
    ).toBe(
      'Keď príde mail z domény dodavatel.sk, z domény firma.sk alebo so slovom „faktúra“ v predmete, okrem mailov od noreply@firma.sk, pridá štítok Faktúry a archivuje ho.',
    );
    expect(
      describeRule(
        draft({
          conditions: [{ type: 'hasAttachment' }],
          actions: [{ type: 'moveTo', mailboxId: MailboxIdSchema.parse('mbx-x') }, { type: 'pin' }],
        }),
        targets,
        'Práca',
      ),
    ).toBe('Keď príde mail do účtu Práca s prílohou, presunie ho a pripne ho.');
    expect(describeRule(draft({}), targets, null)).toBe('Pravidlo zatiaľ nemá žiadnu podmienku.');
  });

  it('summarizes actions as a list', () => {
    expect(summarizeActions([{ type: 'summary' }, { type: 'task' }], targets)).toBe(
      'AI zhrnutie, Vytvoriť úlohu',
    );
  });

  it('detects actions that use AI', () => {
    expect(firstAiAction([{ type: 'archive' }])).toBeNull();
    expect(firstAiAction([{ type: 'pin' }, { type: 'summary' }, { type: 'task' }])).toBe('summary');
    expect(firstAiAction([{ type: 'task' }])).toBe('task');
  });

  it('offers the templates in a fixed order with valid rules', () => {
    expect(RULE_TEMPLATES.map((template) => template.id)).toEqual([
      'jira',
      'newsletter',
      'sender',
      'attachments',
      'blank',
    ]);
    RULE_TEMPLATES.forEach((template) => {
      expect(AutomationActionsSchema.safeParse(template.actions).success).toBe(true);
      template.conditions.forEach((condition) => {
        expect(AutomationConditionSchema.safeParse(condition).success).toBe(true);
      });
    });
    expect(
      RULE_TEMPLATES.filter((template) => template.needs !== null).map((template) => [
        template.id,
        template.needs,
        template.conditions.length,
      ]),
    ).toEqual([
      ['newsletter', 'fromDomain', 0],
      ['sender', 'fromAddress', 0],
    ]);
  });

  it('describes the Jira template by what it matches', () => {
    expect(RULE_TEMPLATES.find((template) => template.id === 'jira')?.description).toBe(
      'Keď ťa v Jire priradia k úlohe, vytvorí úlohu.',
    );
  });

  it('moves a rule to another position', () => {
    expect(moveRule(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveRule(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveRule(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(moveRule(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
    expect(moveRule(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
