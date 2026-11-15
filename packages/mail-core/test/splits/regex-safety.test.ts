import { describe, expect, it } from 'vitest';
import { isUnsafeRegex } from '../../src';

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
  ])('accepts the legitimate pattern %s', (pattern) => {
    expect(isUnsafeRegex(pattern)).toBe(false);
  });
});
