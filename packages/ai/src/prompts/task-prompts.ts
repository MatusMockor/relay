import type { AiJobInput, AiOutput } from '@relay/shared/domain';
import { preparePrompt } from './prepare-prompt';
import type { PreparedPrompt } from './prepared-prompt';
import type { PromptContext } from './prompt-spec';
import { automationDraftPrompt } from './specs/automation-draft';
import { automationTaskPrompt } from './specs/automation-task';
import { chatAnswerPrompt } from './specs/chat-answer';
import { createTaskPrompt } from './specs/create-task';
import { oneLinerPrompt } from './specs/one-liner';
import { replySuggestionsPrompt } from './specs/reply-suggestions';
import { rewritePrompt } from './specs/rewrite';
import { ruleSuggestPrompt } from './specs/rule-suggest';
import { summaryPrompt } from './specs/summary';

export function prepareTaskPrompt(
  input: AiJobInput,
  context: PromptContext,
): PreparedPrompt<AiOutput> {
  switch (input.kind) {
    case 'oneLiner':
      return preparePrompt(oneLinerPrompt, input, context);
    case 'summary':
      return preparePrompt(summaryPrompt, input, context);
    case 'replySuggestions':
      return preparePrompt(replySuggestionsPrompt, input, context);
    case 'chatAnswer':
      return preparePrompt(chatAnswerPrompt, input, context);
    case 'rewrite':
      return preparePrompt(rewritePrompt, input, context);
    case 'createTask':
      return preparePrompt(createTaskPrompt, input, context);
    case 'automationTask':
      return preparePrompt(automationTaskPrompt, input, context);
    case 'automationDraft':
      return preparePrompt(automationDraftPrompt, input, context);
    case 'ruleSuggest':
      return preparePrompt(ruleSuggestPrompt, input, context);
  }
}
