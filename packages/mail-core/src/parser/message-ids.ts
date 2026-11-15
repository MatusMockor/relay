const MESSAGE_ID_PATTERN = /<[^<>\s]+>/g;

export const extractMessageIds = (value: string | readonly string[] | undefined): string[] => {
  if (value === undefined) {
    return [];
  }
  const joined = typeof value === 'string' ? value : value.join(' ');
  const bracketed = joined.match(MESSAGE_ID_PATTERN);
  if (bracketed) {
    return [...new Set(bracketed)];
  }
  return joined
    .split(/\s+/)
    .filter((token) => token.includes('@'))
    .map((token) => `<${token}>`);
};

export const firstMessageId = (value: string | undefined): string | null =>
  extractMessageIds(value)[0] ?? null;
