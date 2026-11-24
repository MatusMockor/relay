import { ValidationError } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { AtlassianSitePolicy } from '../src';

const policy = new AtlassianSitePolicy();

describe('AtlassianSitePolicy', () => {
  it('normalizes Jira Cloud sites to their https origin', () => {
    expect(policy.origin('https://firma.atlassian.net')).toBe('https://firma.atlassian.net');
    expect(policy.origin(' https://Firma.Atlassian.net/jira/your-work?x=1#y ')).toBe(
      'https://firma.atlassian.net',
    );
    expect(policy.origin('firma.atlassian.net')).toBe('https://firma.atlassian.net');
    expect(policy.origin('https://legacy-site.jira.com/browse/A-1')).toBe(
      'https://legacy-site.jira.com',
    );
  });

  it.each([
    'http://firma.atlassian.net',
    'ftp://firma.atlassian.net',
    'https://firma.atlassian.net:8443',
    'https://user:pass@firma.atlassian.net',
    'https://atlassian.net',
    'https://evil.com',
    'https://firma.atlassian.net.evil.com',
    'https://a.b.atlassian.net',
    'https://127.0.0.1',
    'https://localhost',
    'https://[::1]',
    'https://-bad.atlassian.net',
    'not a url at all',
    '',
  ])('rejects %s', (siteUrl) => {
    expect(() => policy.origin(siteUrl)).toThrow(ValidationError);
  });
});
