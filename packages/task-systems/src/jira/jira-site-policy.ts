import { ValidationError } from '@relay/engine';

export interface JiraSitePolicy {
  origin(siteUrl: string): string;
}

const SITE_HINT = 'Zadaj adresu webu Jira Cloud v tvare https://firma.atlassian.net.';
const JIRA_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:atlassian\.net|jira\.com)$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const parse = (siteUrl: string): URL => {
  const trimmed = siteUrl.trim();
  try {
    return new URL(SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ValidationError(SITE_HINT);
  }
};

export class AtlassianSitePolicy implements JiraSitePolicy {
  origin(siteUrl: string): string {
    const url = parse(siteUrl);
    if (url.protocol !== 'https:') {
      throw new ValidationError('Jira sa pripája iba cez https.');
    }
    if (url.username !== '' || url.password !== '' || url.port !== '') {
      throw new ValidationError(SITE_HINT);
    }
    if (!JIRA_HOST.test(url.hostname)) {
      throw new ValidationError(SITE_HINT);
    }
    return `https://${url.hostname}`;
  }
}
