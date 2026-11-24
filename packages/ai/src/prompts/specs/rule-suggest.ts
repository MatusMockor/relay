import {
  type AiJobInput,
  type AiOutputOf,
  type RuleProposal,
  RuleProposalSchema,
  resolveRuleProposal,
} from '@relay/shared/domain';
import type { PromptSpec } from '../prompt-spec';
import { wrapUntrusted } from '../untrusted-content';
import { RULE_SUGGEST_TEXTS } from './rule-suggest-texts';

type RuleSuggestInput = Extract<AiJobInput, { kind: 'ruleSuggest' }>;

const catalogOf = (input: RuleSuggestInput): string =>
  JSON.stringify(
    input.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      selected: account.id === input.accountId,
      labels: account.labels.map((label) => label.name),
      folders: account.folders.map((folder) => folder.name),
    })),
  );

export const ruleSuggestPrompt: PromptSpec<
  RuleSuggestInput,
  RuleProposal,
  AiOutputOf<'ruleSuggest'>
> = {
  kind: 'ruleSuggest',
  responseSchema: RuleProposalSchema,
  tools: [],
  languageRule: 'output',
  task: (_input, context) => RULE_SUGGEST_TEXTS[context.language].task,
  content: (input, context) => {
    const texts = RULE_SUGGEST_TEXTS[context.language];
    return [
      `${texts.sentence}\n${wrapUntrusted(input.sentence, context.nonce)}`,
      `${texts.accounts}\n${wrapUntrusted(catalogOf(input), context.nonce)}`,
    ];
  },
  toOutput: (response, input) => ({
    kind: 'ruleSuggest',
    suggestion: resolveRuleProposal(response, input),
  }),
};
