import { type SplitPreviewBody, SplitPreviewBodySchema } from '@relay/shared';
import type { SplitDraft } from './split-draft';

export type SplitPreviewRequest =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ready'; readonly body: SplitPreviewBody };

export const splitPreviewRequestOf = (draft: SplitDraft): SplitPreviewRequest => {
  if (draft.rules.length === 0) {
    return { kind: 'none' };
  }
  const parsed = SplitPreviewBodySchema.safeParse({
    splitId: draft.id ?? null,
    accountId: draft.accountId,
    match: draft.match,
    rules: draft.rules,
    exceptions: draft.exceptions,
  });
  return parsed.success ? { kind: 'ready', body: parsed.data } : { kind: 'invalid' };
};

export const splitPreviewKeyOf = (request: SplitPreviewRequest): string =>
  JSON.stringify(request.kind === 'ready' ? request.body : null);
