import type { JiraClassification, SplitMatchSubject } from '@relay/engine';
import type { AutomationCondition } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { RuleAutomationMatcher } from '../../src';

const message: SplitMatchSubject = {
  from: { name: 'Jira', email: 'jira@efabrica.atlassian.net' },
  subject: '[EF-12] Platobná brána padá',
  headers: new Map([['x-jira-fingerprint', ['abc']]]),
};

const mention: JiraClassification = {
  jiraKey: 'EF-12',
  eventKind: 'mention',
  actor: 'Peter',
};

describe('RuleAutomationMatcher', () => {
  const matcher = new RuleAutomationMatcher();
  const matches = (conditions: AutomationCondition[], jira: JiraClassification | null = mention) =>
    matcher.matches({ message, jira, conditions });

  it('requires every condition to match', async () => {
    expect(
      await matches([
        { type: 'fromDomain', domain: 'atlassian.net' },
        { type: 'jira', projectKeys: ['EF'] },
        { type: 'jiraEvent', kind: 'mention' },
      ]),
    ).toBe(true);
    expect(
      await matches([
        { type: 'jira', projectKeys: ['EF'] },
        { type: 'subjectRegex', pattern: 'sprint', caseSensitive: false },
      ]),
    ).toBe(false);
  });

  it.each<[JiraClassification['eventKind'], boolean]>([
    ['mention', true],
    ['assigned', false],
    ['status', false],
  ])('matches the Jira event kind %s', async (eventKind, expected) => {
    expect(await matches([{ type: 'jiraEvent', kind: 'mention' }], { ...mention, eventKind })).toBe(
      expected,
    );
  });

  it('never matches a Jira event without a Jira classification or without conditions', async () => {
    expect(await matches([{ type: 'jiraEvent', kind: 'other' }], null)).toBe(false);
    expect(await matches([])).toBe(false);
  });

  describe('recipient and attachment conditions', () => {
    const delivered: SplitMatchSubject = {
      ...message,
      to: [{ name: 'Matúš', email: 'matus@efabrica.sk' }],
      cc: [{ name: null, email: 'faktury@codevo.app' }],
      hasAttachments: true,
    };
    const deliveredMatches = (conditions: AutomationCondition[]) =>
      matcher.matches({ message: delivered, jira: null, conditions });

    it.each<[AutomationCondition, boolean]>([
      [{ type: 'recipient', field: 'to', match: 'address', value: 'Matus@efabrica.sk' }, true],
      [{ type: 'recipient', field: 'cc', match: 'address', value: 'matus@efabrica.sk' }, false],
      [{ type: 'recipient', field: 'cc', match: 'domain', value: '@codevo.app' }, true],
      [{ type: 'recipient', field: 'to', match: 'domain', value: 'codevo.app' }, false],
      [{ type: 'recipient', field: 'any', match: 'domain', value: 'codevo.app' }, true],
      [{ type: 'hasAttachment' }, true],
    ])('evaluates %o', async (condition, expected) => {
      expect(await deliveredMatches([condition])).toBe(expected);
    });

    it('treats a subject without recipients or attachments as not matching', async () => {
      expect(
        await matches([{ type: 'recipient', field: 'any', match: 'domain', value: 'efabrica.sk' }]),
      ).toBe(false);
      expect(await matches([{ type: 'hasAttachment' }])).toBe(false);
    });
  });
});
