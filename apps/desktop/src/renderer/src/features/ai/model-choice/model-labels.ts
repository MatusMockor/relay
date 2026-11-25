import { type AiRunnerKind, findAiModel } from '@relay/shared';
import { effectiveModel, type ModelChoice } from './model-choice';

export const RUNNER_LABELS: Readonly<Record<AiRunnerKind, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

export const modelLabel = (choice: ModelChoice): string => {
  const id = effectiveModel(choice);
  return findAiModel(choice.runner, id)?.label ?? id;
};

export const shortLabel = (label: string): string => label.replace(/^Claude /, '');

export const shortModelLabel = (choice: ModelChoice): string => shortLabel(modelLabel(choice));

export const SETTINGS_CHOICE_LABEL = 'Podľa nastavení';
