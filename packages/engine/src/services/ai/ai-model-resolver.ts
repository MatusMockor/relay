import type { CreateAiJobBody } from '@relay/shared/api';
import {
  type AiModelSelection,
  type AiSettings,
  type AiTaskKind,
  aiModelChoiceIssue,
  runnerModelSelection,
} from '@relay/shared/domain';

const BACKGROUND_KINDS: ReadonlySet<AiTaskKind> = new Set(['oneLiner', 'automationTask']);

const settingsSelectionFor = (settings: AiSettings, kind: AiTaskKind): AiModelSelection => {
  const selection = BACKGROUND_KINDS.has(kind) ? settings.backgroundModel : settings.defaultModel;
  return aiModelChoiceIssue(selection) === null
    ? selection
    : runnerModelSelection(selection.runner);
};

const choosesModel = (body: CreateAiJobBody): boolean =>
  (body.model ?? null) !== null || (body.effort ?? null) !== null;

export const resolveAiModel = (body: CreateAiJobBody, settings: AiSettings): AiModelSelection => {
  const fallback = settingsSelectionFor(settings, body.input.kind);
  const runner = body.runner ?? fallback.runner;
  if (choosesModel(body)) {
    return { runner, model: body.model ?? null, effort: body.effort ?? null };
  }
  if (runner !== fallback.runner) {
    return runnerModelSelection(runner);
  }
  return fallback;
};
