import { z } from 'zod';
import type { AiRunnerKind } from './ai';

export const AiEffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
export type AiEffort = z.infer<typeof AiEffortSchema>;

export const AI_EFFORT_LABELS: Readonly<Record<AiEffort, string>> = {
  low: 'Nízky',
  medium: 'Stredný',
  high: 'Vysoký',
  xhigh: 'Veľmi vysoký',
  max: 'Max',
};

export const DEFAULT_AI_EFFORT: AiEffort = 'medium';

export interface AiModelOption {
  readonly id: string;
  readonly label: string;
  readonly alias: string | null;
  readonly efforts: readonly AiEffort[];
  readonly isDefault: boolean;
}

const CLAUDE_EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const CODEX_EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high', 'xhigh'];

export const AI_MODEL_CATALOG: Readonly<Record<AiRunnerKind, readonly AiModelOption[]>> = {
  claude: [
    {
      id: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      alias: 'opus',
      efforts: CLAUDE_EFFORTS,
      isDefault: true,
    },
    {
      id: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      alias: 'sonnet',
      efforts: CLAUDE_EFFORTS,
      isDefault: false,
    },
    {
      id: 'claude-haiku-5-5',
      label: 'Claude Haiku 5.5',
      alias: 'haiku',
      efforts: CLAUDE_EFFORTS,
      isDefault: false,
    },
  ],
  codex: [
    {
      id: 'gpt-6.1-sol',
      label: 'GPT-6.1 Sol',
      alias: null,
      efforts: CODEX_EFFORTS,
      isDefault: true,
    },
    {
      id: 'gpt-6-astra',
      label: 'GPT-6 Astra',
      alias: null,
      efforts: CODEX_EFFORTS,
      isDefault: false,
    },
    {
      id: 'gpt-6-luna',
      label: 'GPT-6 Luna',
      alias: null,
      efforts: CODEX_EFFORTS,
      isDefault: false,
    },
  ],
};

export const AiModelIdSchema = z.string().min(1).max(100);

export const findAiModel = (runner: AiRunnerKind, modelId: string): AiModelOption | null =>
  AI_MODEL_CATALOG[runner].find((model) => model.id === modelId) ?? null;

export const defaultAiModel = (runner: AiRunnerKind): AiModelOption => {
  const models = AI_MODEL_CATALOG[runner];
  return models.find((model) => model.isDefault) ?? (models[0] as AiModelOption);
};

export const effortsFor = (runner: AiRunnerKind, modelId: string | null): readonly AiEffort[] =>
  (modelId === null ? defaultAiModel(runner) : findAiModel(runner, modelId))?.efforts ?? [];

export interface AiModelChoice {
  readonly runner: AiRunnerKind;
  readonly model?: string | null;
  readonly effort?: AiEffort | null;
}

export const aiModelChoiceIssue = (choice: AiModelChoice): string | null => {
  const model = choice.model ?? null;
  if (model !== null && findAiModel(choice.runner, model) === null) {
    return `Unknown ${choice.runner} model "${model}"`;
  }
  const effort = choice.effort ?? null;
  if (effort !== null && !effortsFor(choice.runner, model).includes(effort)) {
    return `The model does not support the "${effort}" effort`;
  }
  return null;
};

export const refineAiModelChoice = (choice: AiModelChoice, context: z.RefinementCtx): void => {
  const issue = aiModelChoiceIssue(choice);
  if (issue === null) {
    return;
  }
  context.addIssue({ code: 'custom', message: issue, path: ['model'] });
};
