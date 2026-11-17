import {
  type AiEffort,
  type AiRunnerKind,
  defaultAiModel,
  effortsFor,
  findAiModel,
} from '@relay/shared';

export interface ModelChoice {
  readonly runner: AiRunnerKind;
  readonly model: string | null;
  readonly effort: AiEffort | null;
}

export const RUNNER_LABELS: Readonly<Record<AiRunnerKind, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

export const RUNNERS: readonly AiRunnerKind[] = ['claude', 'codex'];

export const effectiveModel = (choice: ModelChoice): string =>
  choice.model ?? defaultAiModel(choice.runner).id;

export const modelLabel = (choice: ModelChoice): string => {
  const id = effectiveModel(choice);
  return findAiModel(choice.runner, id)?.label ?? id;
};

const supportedEffort = (
  runner: AiRunnerKind,
  model: string,
  effort: AiEffort | null,
): AiEffort | null =>
  effort !== null && effortsFor(runner, model).includes(effort) ? effort : null;

export const withRunner = (choice: ModelChoice, runner: AiRunnerKind): ModelChoice => {
  if (runner === choice.runner) {
    return choice;
  }
  const model = defaultAiModel(runner).id;
  return { runner, model, effort: supportedEffort(runner, model, choice.effort) };
};

export const withModel = (choice: ModelChoice, model: string): ModelChoice => ({
  ...choice,
  model,
  effort: supportedEffort(choice.runner, model, choice.effort),
});

export const withEffort = (choice: ModelChoice, effort: AiEffort): ModelChoice => ({
  ...choice,
  effort,
});
