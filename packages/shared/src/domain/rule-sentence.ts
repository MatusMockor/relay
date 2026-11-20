import { EmailAddressSchema } from './primitives';
import { foldName } from './rule-target-match';

const FORWARD_WORDS = /\b(preposl|preposiel|forward|presmer)/;
const REPLY_WORDS = /\b(odpoved|odpis|koncept|reply|draft)/;
const ADDRESS_TOKENS = /[^\s<>()[\],;:"'„“”]+@[^\s<>()[\],;:"'„“”]+/gu;

export const asksToForward = (sentence: string): boolean => FORWARD_WORDS.test(foldName(sentence));

export const asksForReplyDraft = (sentence: string): boolean =>
  REPLY_WORDS.test(foldName(sentence));

const addressesIn = (sentence: string): string[] =>
  [...sentence.matchAll(ADDRESS_TOKENS)].map((match) =>
    match[0].replace(/[.!?]+$/u, '').toLowerCase(),
  );

export const quotesAddress = (sentence: string, address: string): boolean =>
  EmailAddressSchema.safeParse(address).success &&
  addressesIn(sentence).includes(address.toLowerCase());
