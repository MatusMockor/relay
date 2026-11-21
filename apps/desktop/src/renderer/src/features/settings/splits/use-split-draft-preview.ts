import { SplitPreviewBodySchema } from '@relay/shared';
import { useSplitPreview } from '../../../data/hooks/use-split-preview';
import { useDebouncedKey } from '../automations/use-debounced-key';
import type { SplitDraft } from './split-draft';
import { splitPreviewKeyOf, splitPreviewRequestOf } from './split-preview-request';

const PreviewKeySchema = SplitPreviewBodySchema.nullable();

export const useSplitDraftPreview = (draft: SplitDraft) => {
  const request = splitPreviewRequestOf(draft);
  const key = splitPreviewKeyOf(request);
  const settled = useDebouncedKey(key);
  const parsed = PreviewKeySchema.safeParse(JSON.parse(settled));
  const query = useSplitPreview(parsed.success ? parsed.data : null);
  return {
    enabled: request.kind !== 'none',
    invalid: request.kind === 'invalid',
    waiting: settled !== key,
    query,
  };
};
