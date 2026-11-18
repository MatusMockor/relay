import { describe, expect, it } from 'vitest';
import { describeRule, readableRule } from '../src/features/settings/sections/split-rules';

describe('split rule rendering', () => {
  it('reads sender and Jira rules in Slovak', () => {
    expect(readableRule({ type: 'fromDomain', domain: 'firma.sk' })).toBe('od @firma.sk');
    expect(readableRule({ type: 'fromAddress', address: 'jana@firma.sk' })).toBe(
      'od jana@firma.sk',
    );
    expect(readableRule({ type: 'jira', projectKeys: ['WEB', 'API'] })).toBe(
      'z Jiry, projekty WEB, API',
    );
    expect(readableRule({ type: 'jira', projectKeys: [] })).toBe('z Jiry, všetky projekty');
  });

  it('describes a header presence rule without the pattern', () => {
    expect(readableRule({ type: 'header', name: 'List-Unsubscribe', pattern: '.+' })).toBe(
      'má hlavičku List-Unsubscribe',
    );
    expect(readableRule({ type: 'header', name: 'X-Tag', pattern: 'news' })).toBe(
      'hlavička X-Tag zodpovedá /news/',
    );
  });

  it('keeps the raw query for the tooltip', () => {
    expect(describeRule({ type: 'header', name: 'List-Unsubscribe', pattern: '.+' })).toBe(
      'header:List-Unsubscribe~.+',
    );
    expect(describeRule({ type: 'subjectRegex', pattern: 'faktúra', caseSensitive: false })).toBe(
      'subject:/faktúra/i',
    );
  });
});
