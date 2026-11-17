import {
  AI_EFFORT_LABELS,
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

export const modelLabel = (choice: ModelChoice): string => {
  if (choice.model === null) {
    return `Predvolený (${defaultAiModel(choice.runner).label})`;
  }
  return findAiModel(choice.runner, choice.model)?.label ?? choice.model;
};

export const effortLabel = (effort: AiEffort | null): string =>
  effort === null ? 'Predvolené' : AI_EFFORT_LABELS[effort];

export const describeChoice = (choice: ModelChoice): string => {
  const parts = [RUNNER_LABELS[choice.runner], modelLabel(choice)];
  return choice.effort === null
    ? parts.join(' · ')
    : [...parts, AI_EFFORT_LABELS[choice.effort]].join(' · ');
};

export const withRunner = (choice: ModelChoice, runner: AiRunnerKind): ModelChoice =>
  runner === choice.runner ? choice : { runner, model: null, effort: null };

export const withModel = (choice: ModelChoice, model: string | null): ModelChoice => {
  const supported = effortsFor(choice.runner, model);
  const effort = choice.effort !== null && supported.includes(choice.effort) ? choice.effort : null;
  return { ...choice, model, effort };
};

export const withEffort = (choice: ModelChoice, effort: AiEffort | null): ModelChoice => ({
  ...choice,
  effort,
});
