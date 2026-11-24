import { AutomationPreviewBodySchema } from '@relay/shared';
import { useAutomationPreview } from '../../../data/hooks/use-automation-preview';
import type { RuleInput } from './editable-rule';
import { previewKeyOf, previewRequestOf } from './preview-request';
import { useDebouncedKey } from './use-debounced-key';

const PreviewKeySchema = AutomationPreviewBodySchema.nullable();

export const useRulePreview = (input: RuleInput) => {
  const request = previewRequestOf(input);
  const key = previewKeyOf(request);
  const settled = useDebouncedKey(key);
  const parsed = PreviewKeySchema.safeParse(JSON.parse(settled));
  const query = useAutomationPreview(parsed.success ? parsed.data : null);
  return {
    enabled: request.kind !== 'none',
    invalid: request.kind === 'invalid',
    waiting: settled !== key,
    query,
  };
};
