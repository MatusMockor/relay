import { describe, expect, it } from 'vitest';
import { isUnsafeRegex } from '../../src';

const hanBranches = (count: number): string =>
  Array.from({ length: count }, (_, index) => `${String.fromCodePoint(0x4e00 + index)}x`).join('|');

describe('isUnsafeRegex', () => {
  it.each([
    ['nested repetition through extra groups', '^((a+))+$'],
    ['nested repetition through a non-capturing group', '^(?:(?:a+)b?)+$'],
    ['nested bounded repetition', '(\\w+\\s?){1,5}$'],
    ['optional quantified group inside a loop', '((ab)*c?)*$'],
    ['overlapping adjacent quantifiers', 'a+a+$'],
    ['overlapping quantifiers separated by an optional atom', '\\d+\\s*\\d+$'],
    ['overlapping quantifiers across a group boundary', '(a+)a*$'],
    ['overlapping character classes', '[a-z]+\\w+$'],
    ['case-insensitive overlap', 'A+a+$'],
    ['quantified alternation with identical branches', '(a|a)*b'],
    ['quantified alternation with a common prefix', '(a|ab)+$'],
    ['quantified alternation with overlapping classes', '(\\w|\\d)+$'],
    ['quantified alternation with an empty branch', '(a|)+$'],
    ['ambiguous alternation nested in a repeated group', '((a|a)b)+$'],
    ['ambiguous alternation of literals outside the sampled ranges', '^(漢|漢漢)+$'],
    ['overlapping classes outside the sampled ranges', '[\\u{20000}-\\u{20010}]+\\p{Script=Han}+$'],
    ['repeated nullable body', '^(a?b?){40}c$'],
    ['repeated body with an optional atom', '^(?:a?a){40}$'],
    [
      'ambiguous alternation of lone surrogates',
      '^(?:[\\uD800-\\uDBFF]|[\\uD800-\\uDBFF][\\uD800-\\uDBFF])+$',
    ],
    ['overlapping low surrogate classes', '[\\uDC00-\\uDC10]+[\\uDC08-\\uDFFF]+$'],
    ['loops behind optional wrappers', '^(?:a+)?(?:a+)?(?:a+)?a+$'],
    ['a loop at the end of an optional group', '^(?:b\\d+)?\\d+$'],
    ['a loop that can skip an optional group', '^a+(?:b)?a+$'],
    ['a pattern longer than the analysis limit', `^(?:${'a'.repeat(600)})$`],
    ['groups nested deeper than the analysis limit', `${'('.repeat(20)}a${')'.repeat(20)}`],
    ['a repeated alternation that exhausts the analysis budget', `^(?:${hanBranches(150)})+$`],
    ['numbered backreference', '(x)\\1'],
    ['named backreference', '(?<word>x)\\k<word>'],
    ['pattern that does not parse in unicode mode', '\\-'],
  ])('rejects %s: %s', (_name, pattern) => {
    expect(isUnsafeRegex(pattern)).toBe(true);
  });

  it.each([
    '^faktúra',
    'WEB-\\d+',
    '(alert|warning):',
    '[a-z]{2,5}',
    '^\\[JIRA\\] \\(WEB-\\d+\\)',
    'faktúra|invoice|rechnung',
    '(?:foo)+(?:bar)+',
    '(?:alert|warning)+:',
    '\\d+-\\d+',
    '\\s+\\S+',
    '\\p{Script=Han}+\\d+',
    '.*objednávka',
    '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}',
    '(?:\\d{2})+',
    '^(?=.*urgent)',
    '^(?:re|fwd)?:?\\s*\\[WEB-\\d+\\]',
    '(?:\\d+x)?y\\d+',
    `^(?:${hanBranches(20)})+$`,
    '[\\[(]+\\)',
  ])('accepts the legitimate pattern %s', (pattern) => {
    expect(isUnsafeRegex(pattern)).toBe(false);
  });

  it('rejects a huge alternation quickly instead of comparing every branch pair', () => {
    const pattern = `^(?:${hanBranches(30_000)})+$`;
    const startedAt = performance.now();

    expect(isUnsafeRegex(pattern)).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(250);
  });
});
