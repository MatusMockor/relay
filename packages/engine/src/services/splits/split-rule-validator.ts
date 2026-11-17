import type { SplitInput } from '@relay/shared/api';
import type { AutomationCondition } from '@relay/shared/domain';
import { ValidationError } from '../../errors';
import type { SplitPatternPolicy } from '../../ports/split-pattern-policy';

const patternOf = (rule: AutomationCondition): { pattern: string; flags: string } | null => {
  if (rule.type === 'subjectRegex') {
    return { pattern: rule.pattern, flags: rule.caseSensitive ? '' : 'i' };
  }
  if (rule.type === 'header') {
    return { pattern: rule.pattern, flags: '' };
  }
  return null;
};

const compiles = (pattern: string, flags: string): boolean => {
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
};

export const PERMISSIVE_PATTERN_POLICY: SplitPatternPolicy = { isUnsafe: () => false };

export interface PatternOwner {
  readonly kind: string;
  readonly name: string;
  readonly rules: readonly AutomationCondition[];
}

export const assertRulePatterns = (owner: PatternOwner, policy: SplitPatternPolicy): void => {
  owner.rules.forEach((rule) => {
    const regex = patternOf(rule);
    if (regex === null) {
      return;
    }
    if (!compiles(regex.pattern, regex.flags)) {
      throw new ValidationError(
        `${owner.kind} "${owner.name}" has an invalid pattern: ${regex.pattern}`,
      );
    }
    if (policy.isUnsafe(regex.pattern)) {
      throw new ValidationError(
        `${owner.kind} "${owner.name}" has a pattern that is too complex: ${regex.pattern}`,
      );
    }
  });
};

export const validateSplitRules = (
  inputs: readonly SplitInput[],
  policy: SplitPatternPolicy,
): void => {
  inputs.forEach((input) => {
    assertRulePatterns({ kind: 'Split', name: input.name, rules: input.rules }, policy);
  });
};
