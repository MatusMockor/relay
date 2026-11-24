import { type AutomationPreviewBody, AutomationPreviewBodySchema } from '@relay/shared';
import type { RuleInput } from './editable-rule';

export type PreviewRequest =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ready'; readonly body: AutomationPreviewBody };

export const previewRequestOf = (input: RuleInput): PreviewRequest => {
  if (input.conditions.length === 0) {
    return { kind: 'none' };
  }
  const parsed = AutomationPreviewBodySchema.safeParse({
    accountId: input.accountId,
    match: input.match,
    conditions: input.conditions,
    exceptions: input.exceptions,
  });
  return parsed.success ? { kind: 'ready', body: parsed.data } : { kind: 'invalid' };
};

export const previewKeyOf = (request: PreviewRequest): string =>
  JSON.stringify(request.kind === 'ready' ? request.body : null);
