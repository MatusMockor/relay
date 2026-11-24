export const messageIdOf = (scope: string, index: number): string =>
  `<qa-${scope}-${String(index)}@relay.test>`;

export const replySubject = (subject: string): string => `Re: ${subject}`;

export const referencesOf = (chain: readonly string[], limit = 10): readonly string[] =>
  chain.slice(-limit);
