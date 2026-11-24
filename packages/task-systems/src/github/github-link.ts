import { ProviderError } from '@relay/engine';

const LINK_PART = /^\s*<([^>]+)>(.*)$/;
const REL_PARAM = /^\s*rel\s*=\s*"?([^"]*)"?\s*$/i;

const isNextRel = (params: string): boolean =>
  params
    .split(';')
    .map((param) => REL_PARAM.exec(param)?.[1] ?? '')
    .some((rel) => rel.toLowerCase().split(/\s+/).includes('next'));

const nextTarget = (header: string): string | null => {
  for (const part of header.split(',')) {
    const match = LINK_PART.exec(part);
    if (match?.[1] !== undefined && isNextRel(match[2] ?? '')) {
      return match[1];
    }
  }
  return null;
};

const sameOrigin = (target: string, origin: string): URL | null => {
  try {
    const url = new URL(target, origin);
    return url.origin === origin ? url : null;
  } catch {
    return null;
  }
};

export const nextPageOf = (header: string | null, origin: string): string | null => {
  const target = header === null ? null : nextTarget(header);
  if (target === null) {
    return null;
  }
  const url = sameOrigin(target, origin);
  if (url === null) {
    throw new ProviderError('GitHub vrátil neplatný odkaz na ďalšiu stranu.');
  }
  return `${url.pathname}${url.search}`;
};
