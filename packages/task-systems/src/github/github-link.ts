import { ProviderError } from '@relay/engine';
import { parseLinkHeader } from './github-link-header';

const resolveOnOrigin = (target: string, requestUrl: string, origin: string): URL | null => {
  try {
    const url = new URL(target, requestUrl);
    return url.origin === origin ? url : null;
  } catch {
    return null;
  }
};

export const nextPageOf = (
  header: string | null,
  requestUrl: string,
  origin: string,
): string | null => {
  const next = parseLinkHeader(header ?? '').find((link) => link.rels.includes('next'));
  if (next === undefined) {
    return null;
  }
  const url = resolveOnOrigin(next.target, requestUrl, origin);
  if (url === null) {
    throw new ProviderError('GitHub vrátil neplatný odkaz na ďalšiu stranu.');
  }
  return `${url.pathname}${url.search}`;
};
