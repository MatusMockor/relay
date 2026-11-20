import { AutomationPreviewBodySchema } from '@relay/shared';
import { useEffect, useState } from 'react';
import { useAutomationPreview } from '../../../data/hooks/use-automation-preview';
import type { RuleInput } from './editable-rule';
import { previewKeyOf, previewRequestOf } from './preview-request';

export const PREVIEW_DEBOUNCE_MS = 400;

const PreviewKeySchema = AutomationPreviewBodySchema.nullable();

export const useRulePreview = (input: RuleInput) => {
  const request = previewRequestOf(input);
  const key = previewKeyOf(request);
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
  return {
    enabled: request.kind !== 'none',
    invalid: request.kind === 'invalid',
    waiting: settled !== key,
    query,
  };
};
