import { type AutomationPreviewBody, AutomationPreviewBodySchema } from '@relay/shared';
import { useEffect, useState } from 'react';
import { useAutomationPreview } from '../../../data/hooks/use-automation-preview';
import type { RuleInput } from './editable-rule';

export const PREVIEW_DEBOUNCE_MS = 400;

const PreviewKeySchema = AutomationPreviewBodySchema.nullable();

const bodyOf = (input: RuleInput): AutomationPreviewBody | null =>
  input.conditions.length === 0
    ? null
    : {
        accountId: input.accountId,
        match: input.match,
        conditions: input.conditions,
        exceptions: input.exceptions,
      };

export const useRulePreview = (input: RuleInput) => {
  const key = JSON.stringify(bodyOf(input));
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(key);
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [key]);
  const parsed = PreviewKeySchema.safeParse(JSON.parse(settled));
  const query = useAutomationPreview(parsed.success ? parsed.data : null);
  return { enabled: input.conditions.length > 0, waiting: settled !== key, query };
};
