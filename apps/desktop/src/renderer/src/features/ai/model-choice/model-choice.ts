import {
  type AiEffort,
  type AiRunnerKind,
  DEFAULT_AI_EFFORT,
  defaultAiModel,
  effortsFor,
} from '@relay/shared';

export interface ModelChoice {
  readonly runner: AiRunnerKind;
  readonly model: string | null;
  readonly effort: AiEffort | null;
}

export const RUNNERS: readonly AiRunnerKind[] = ['claude', 'codex'];

export const defaultChoice = (runner: AiRunnerKind): ModelChoice => ({
  runner,
  model: null,
  effort: null,
});

export const effectiveModel = (choice: ModelChoice): string =>
  choice.model ?? defaultAiModel(choice.runner).id;

export const choiceEfforts = (choice: ModelChoice): readonly AiEffort[] =>
  effortsFor(choice.runner, effectiveModel(choice));

export const effectiveEffort = (choice: ModelChoice): AiEffort | null => {
  const efforts = choiceEfforts(choice);
  if (choice.effort !== null && efforts.includes(choice.effort)) {
    return choice.effort;
  }
  return efforts.includes(DEFAULT_AI_EFFORT) ? DEFAULT_AI_EFFORT : null;
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

export const withSelection = (
  choice: ModelChoice,
  runner: AiRunnerKind,
  model: string,
): ModelChoice => withModel(withRunner(choice, runner), model);

export const withEffort = (choice: ModelChoice, effort: AiEffort): ModelChoice => ({
  ...choice,
  effort,
});
