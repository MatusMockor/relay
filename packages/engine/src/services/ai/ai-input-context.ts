import type { AiJobInput, DraftId, MessageId, ThreadId } from '@relay/shared/domain';

export const threadIdOf = (input: AiJobInput): ThreadId | null => {
  if (input.kind === 'rewrite') {
    return null;
  }
  return input.threadId;
};

export const draftIdOf = (input: AiJobInput): DraftId | null =>
  input.kind === 'rewrite' ? input.draftId : null;

export const sourceMessageIdOf = (input: AiJobInput): MessageId | null =>
  'sourceMessageId' in input ? (input.sourceMessageId ?? null) : null;

type ThreadScopedInput = Extract<AiJobInput, { kind: 'oneLiner' | 'summary' | 'replySuggestions' }>;

export const isThreadScoped = (input: AiJobInput): input is ThreadScopedInput =>
  input.kind === 'oneLiner' || input.kind === 'summary' || input.kind === 'replySuggestions';
