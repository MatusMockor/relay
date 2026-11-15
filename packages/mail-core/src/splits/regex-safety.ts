const NESTED_QUANTIFIER =
  /\((?:[^()\\]|\\.)*(?:[+*]|\{\d+,\d*\})(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,\d*\})/;
const QUANTIFIED_ALTERNATION = /\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,\d*\})/;
const BACKREFERENCE = /\\[1-9]/;

export const MAX_MATCH_INPUT_LENGTH = 2_000;

export const isUnsafeRegex = (pattern: string): boolean =>
  NESTED_QUANTIFIER.test(pattern) ||
  QUANTIFIED_ALTERNATION.test(pattern) ||
  BACKREFERENCE.test(pattern);
