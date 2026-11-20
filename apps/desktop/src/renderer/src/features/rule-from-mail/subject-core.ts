export const SUBJECT_CORE_MAX = 60;

const REPLY_PREFIX = /^\s*(?:re|fw|fwd|odp|aw|wg|sv|vs|tr)\s*(?:\[\d+\]|\(\d+\))?\s*:\s*/iu;

const withoutPrefixes = (subject: string): string => {
  const stripped = subject.replace(REPLY_PREFIX, '');
  return stripped === subject ? subject : withoutPrefixes(stripped);
};

export const subjectCore = (subject: string): string =>
  withoutPrefixes(subject).trim().slice(0, SUBJECT_CORE_MAX).trim();
