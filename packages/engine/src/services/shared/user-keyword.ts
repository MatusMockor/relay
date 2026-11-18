const DENIED_KEYWORDS: ReadonlySet<string> = new Set(['junk', 'nonjunk', 'notjunk']);

export const isUserKeyword = (keyword: string): boolean => {
  const trimmed = keyword.trim();
  if (trimmed === '' || trimmed.startsWith('\\') || trimmed.startsWith('$')) {
    return false;
  }
  return !DENIED_KEYWORDS.has(trimmed.toLowerCase());
};
