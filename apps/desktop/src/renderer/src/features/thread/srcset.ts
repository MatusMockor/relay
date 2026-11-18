export interface SrcsetCandidate {
  readonly url: string;
  readonly descriptor: string;
}

const REMOTE_URL_PATTERN = /^\s*(?:https?:)?\/\//i;

export const isRemoteUrl = (url: string): boolean => REMOTE_URL_PATTERN.test(url);

const nextCandidate = (rest: string): readonly [SrcsetCandidate | null, string] => {
  const start = rest.replace(/^[\s,]+/, '');
  const url = /^\S+/.exec(start)?.[0] ?? '';
  if (url === '') {
    return [null, ''];
  }
  const after = start.slice(url.length);
  if (url.endsWith(',')) {
    return [{ url: url.replace(/,+$/, ''), descriptor: '' }, after];
  }
  const descriptor = /^[^,]*/.exec(after)?.[0] ?? '';
  return [{ url, descriptor: descriptor.trim() }, after.slice(descriptor.length)];
};

export const parseSrcset = (srcset: string): SrcsetCandidate[] => {
  const candidates: SrcsetCandidate[] = [];
  let rest = srcset;
  for (;;) {
    const [candidate, remaining] = nextCandidate(rest);
    if (candidate === null) {
      return candidates;
    }
    candidates.push(candidate);
    rest = remaining;
  }
};

export const serializeSrcset = (candidates: readonly SrcsetCandidate[]): string =>
  candidates
    .map((candidate) =>
      candidate.descriptor === '' ? candidate.url : `${candidate.url} ${candidate.descriptor}`,
    )
    .join(', ');
