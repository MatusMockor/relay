const REPLY_PREFIX = /^\s*(re|fw|fwd|aw|wg|sv|vs|odp|tr|rv|antw)(\s*\[\d+\]|\s*\(\d+\))?\s*:\s*/i;
const BRACKET_TAG = /^\s*\[(external|ext|externé|externí)\]\s*/i;
const MAX_SUBJECT_LENGTH = 1_000;
const MAX_PREFIXES = 50;

export interface NormalizedSubject {
  readonly value: string;
  readonly hadReplyPrefix: boolean;
}

export const normalizeSubject = (subject: string): NormalizedSubject => {
  let value = subject.slice(0, MAX_SUBJECT_LENGTH);
  let hadReplyPrefix = false;
  for (let round = 0; round < MAX_PREFIXES; round += 1) {
    const untagged = value.replace(BRACKET_TAG, '');
    const unprefixed = untagged.replace(REPLY_PREFIX, '');
    if (unprefixed === value) {
      break;
    }
    hadReplyPrefix ||= unprefixed !== untagged;
    value = unprefixed;
  }
  return { value: value.replace(/\s+/g, ' ').trim().toLowerCase(), hadReplyPrefix };
};
