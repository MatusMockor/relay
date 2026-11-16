import type { Address } from '@relay/shared';
import { EMAIL_PATTERN } from '../use-known-contacts';

export interface RecipientEntry {
  readonly address: Address;
  readonly valid: boolean;
}

const NAMED = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/;

const splitTokens = (text: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let quoted = false;
  let angled = false;
  for (const character of text) {
    if (character === '"') {
      quoted = !quoted;
    }
    if (character === '<') {
      angled = true;
    }
    if (character === '>') {
      angled = false;
    }
    if (/[,;\n]/.test(character) && !quoted && !angled) {
      tokens.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  return [...tokens, current].map((token) => token.trim()).filter((token) => token !== '');
};

export const parseRecipient = (token: string): RecipientEntry => {
  const named = NAMED.exec(token);
  const email = (named?.[2] ?? token).trim();
  const name = named?.[1]?.trim() ?? '';
  return {
    address: { name: name === '' ? null : name, email },
    valid: EMAIL_PATTERN.test(email),
  };
};

export const parseRecipients = (text: string): RecipientEntry[] =>
  splitTokens(text).map(parseRecipient);

export const entriesOf = (addresses: readonly Address[]): RecipientEntry[] =>
  addresses.map((address) => ({ address, valid: EMAIL_PATTERN.test(address.email) }));

export const validAddresses = (entries: readonly RecipientEntry[]): Address[] =>
  entries.filter((entry) => entry.valid).map((entry) => entry.address);

export const mergeEntries = (
  current: readonly RecipientEntry[],
  added: readonly RecipientEntry[],
): RecipientEntry[] =>
  added.reduce<RecipientEntry[]>(
    (entries, entry) =>
      entries.some((item) => item.address.email.toLowerCase() === entry.address.email.toLowerCase())
        ? entries
        : [...entries, entry],
    [...current],
  );
