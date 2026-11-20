import type { SplitMatchSubject } from '@relay/engine';
import type { Split, SplitId, SplitRule, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { isUnsafeRegex, MAX_MATCH_INPUT_LENGTH, RuleSplitMatcher } from '../../src';

const split = (id: string, rules: SplitRule[], order = 0): Split => ({
  id: id as SplitId,
  userId: 'user_1' as UserId,
  accountId: null,
  name: id,
  order,
  match: 'any',
  rules,
  exceptions: [],
  exclusive: false,
  hideTasks: false,
});

const subject = (overrides: Partial<SplitMatchSubject> = {}): SplitMatchSubject => ({
  from: { name: 'Peter', email: 'Peter.Novak@Mail.Firma.sk' },
  subject: 'Faktúra 2026/11 za služby',
  headers: new Map([['list-id', ['Dev team <dev.lists.firma.sk>']]]),
  ...overrides,
});

describe('RuleSplitMatcher', () => {
  const matcher = new RuleSplitMatcher();

  it.each<[string, SplitRule, boolean]>([
    ['domain exact', { type: 'fromDomain', domain: 'mail.firma.sk' }, true],
    ['domain parent', { type: 'fromDomain', domain: 'firma.sk' }, true],
    ['domain with @', { type: 'fromDomain', domain: '@FIRMA.sk' }, true],
    ['domain suffix only', { type: 'fromDomain', domain: 'rma.sk' }, false],
    [
      'address case-insensitive',
      { type: 'fromAddress', address: 'peter.novak@mail.firma.sk' },
      true,
    ],
    ['other address', { type: 'fromAddress', address: 'jana@firma.sk' }, false],
    [
      'subject regex insensitive',
      { type: 'subjectRegex', pattern: '^faktúra \\d{4}', caseSensitive: false },
      true,
    ],
    [
      'subject regex sensitive',
      { type: 'subjectRegex', pattern: '^faktúra', caseSensitive: true },
      false,
    ],
    ['invalid regex', { type: 'subjectRegex', pattern: '([', caseSensitive: false }, false],
    ['header regex', { type: 'header', name: 'List-Id', pattern: 'dev\\.lists' }, true],
    ['missing header', { type: 'header', name: 'X-Spam', pattern: '.*' }, false],
    ['jira without classification', { type: 'jira', projectKeys: [] }, false],
  ])('%s', async (_name, rule, expected) => {
    const result = await matcher.match({
      message: subject(),
      jira: null,
      splits: [split('s1', [rule])],
    });

    expect(result).toEqual(expected ? ['s1'] : []);
  });

  it('matches jira rules by project key', async () => {
    const jira = { jiraKey: 'WEB-482', eventKind: 'mention' as const, actor: null };
    const splits = [
      split('any-jira', [{ type: 'jira', projectKeys: [] }], 2),
      split('web', [{ type: 'jira', projectKeys: ['WEB', 'APP'] }], 1),
      split('ops', [{ type: 'jira', projectKeys: ['OPS'] }], 0),
    ];

    expect(await matcher.match({ message: subject(), jira, splits })).toEqual(['web', 'any-jira']);
  });

  it('matches a split when any of its rules matches and returns ids in split order', async () => {
    const splits = [
      split(
        'b',
        [
          { type: 'fromAddress', address: 'x@y.sk' },
          { type: 'fromDomain', domain: 'firma.sk' },
        ],
        5,
      ),
      split('a', [{ type: 'subjectRegex', pattern: 'služby$', caseSensitive: true }], 1),
      split('c', [{ type: 'fromAddress', address: 'x@y.sk' }], 0),
    ];

    expect(await matcher.match({ message: subject(), jira: null, splits })).toEqual(['a', 'b']);
  });

  it.each(['^(a+)+$', '(a|aa)*b', '(\\w+\\s?)*$', '(x)\\1', '^((a+))+$', 'a+a+$'])(
    'refuses the catastrophic pattern %s without hanging',
    async (pattern) => {
      const message = subject({ subject: `${'a'.repeat(5_000)}!` });
      const splits = [split('s', [{ type: 'subjectRegex', pattern, caseSensitive: false }])];

      expect(isUnsafeRegex(pattern)).toBe(true);
      expect(await matcher.match({ message, jira: null, splits })).toEqual([]);
    },
  );

  it('refuses a case-sensitive pattern whose branches overlap only without the i flag', async () => {
    const pattern = '^(?:[^a]|AA)+$';
    const message = subject({ subject: `${'A'.repeat(MAX_MATCH_INPUT_LENGTH - 1)}a` });
    const splits = [split('s', [{ type: 'subjectRegex', pattern, caseSensitive: true }])];

    expect(isUnsafeRegex(pattern)).toBe(true);
    expect(await matcher.match({ message, jira: null, splits })).toEqual([]);
  });

  it('only matches subject patterns against the capped subject', async () => {
    const message = subject({ subject: `${'x'.repeat(MAX_MATCH_INPUT_LENGTH)}needle` });
    const splits = [
      split('s', [{ type: 'subjectRegex', pattern: 'needle', caseSensitive: false }]),
    ];

    expect(await matcher.match({ message, jira: null, splits })).toEqual([]);
    expect(
      await matcher.match({ message: subject({ subject: 'a needle' }), jira: null, splits }),
    ).toEqual(['s']);
  });

  it('keeps ordinary patterns usable', () => {
    expect(['^faktúra', 'WEB-\\d+', '(alert|warning):', '[a-z]{2,5}'].map(isUnsafeRegex)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('does not match sender rules when the message has no sender', async () => {
    const splits = [split('s', [{ type: 'fromDomain', domain: 'firma.sk' }])];

    expect(await matcher.match({ message: subject({ from: null }), jira: null, splits })).toEqual(
      [],
    );
  });
});
