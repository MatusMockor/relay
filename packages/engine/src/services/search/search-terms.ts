export const searchTerms = (q: string, maxTerms: number): string[] =>
  [
    ...new Set(
      q
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term !== ''),
    ),
  ].slice(0, maxTerms);
