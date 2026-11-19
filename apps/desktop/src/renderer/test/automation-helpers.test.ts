import { AutomationActionsSchema, AutomationConditionSchema } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import type { ActionTargets } from '../src/features/settings/automations/action-targets';
import { moveRule } from '../src/features/settings/automations/rule-order';
import {
  summarizeActions,
  summarizeConditions,
  firstAiAction,
} from '../src/features/settings/automations/rule-summary';
import { RULE_TEMPLATES } from '../src/features/settings/automations/rule-templates';

const targets: ActionTargets = { mailboxes: [], labels: [], loaded: false, gmail: false };

describe('automation helpers', () => {
  it('summarizes conditions as one sentence', () => {
    expect(
      summarizeConditions([
        { type: 'jira', projectKeys: [] },
        { type: 'jiraEvent', kind: 'assigned' },
      ]),
    ).toBe('Z Jiry a Jira udalosť je Priradenie');
    expect(summarizeConditions([])).toBe('');
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

  it('moves a rule to another position', () => {
    expect(moveRule(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveRule(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveRule(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(moveRule(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
    expect(moveRule(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
