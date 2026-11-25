import { z } from 'zod';
import { type AiRunnerKind, AiRunnerKindSchema, AiRunnerLocationSchema } from './ai';
import {
  type AiModelSelection,
  AiModelSelectionInputSchema,
  AiModelSelectionSchema,
  runnerModelSelection,
} from './ai-model-selection';

export const AiFeaturesSchema = z.object({
  oneLiners: z.boolean(),
  summaries: z.boolean(),
  replySuggestions: z.boolean(),
  jiraTriage: z.boolean(),
});
export type AiFeatures = z.infer<typeof AiFeaturesSchema>;

export const DEFAULT_MODEL_SELECTION: AiModelSelection = runnerModelSelection('claude');

export const DEFAULT_BACKGROUND_MODEL_SELECTION: AiModelSelection = {
  runner: 'claude',
  model: 'claude-haiku-5-5',
  effort: 'low',
};

const legacyDefaultModel = (
  defaultModel: AiModelSelection | undefined,
  defaultRunner: AiRunnerKind | undefined,
): AiModelSelection | undefined =>
  defaultModel ?? (defaultRunner === undefined ? undefined : runnerModelSelection(defaultRunner));

const LEGACY_BACKGROUND_MODELS: Readonly<Record<AiRunnerKind, AiModelSelection>> = {
  claude: DEFAULT_BACKGROUND_MODEL_SELECTION,
  codex: { runner: 'codex', model: null, effort: 'low' },
};

const backgroundModelOf = (
  backgroundModel: AiModelSelection | undefined,
  defaultRunner: AiRunnerKind | undefined,
): AiModelSelection =>
  backgroundModel ?? {
    ...(defaultRunner === undefined
      ? DEFAULT_BACKGROUND_MODEL_SELECTION
      : LEGACY_BACKGROUND_MODELS[defaultRunner]),
  };

export const AiSettingsSchema = z
  .object({
    location: AiRunnerLocationSchema,
    defaultRunner: AiRunnerKindSchema.optional(),
    defaultModel: AiModelSelectionSchema.optional(),
    backgroundModel: AiModelSelectionSchema.optional(),
    features: AiFeaturesSchema,
  })
  .transform(({ defaultRunner, defaultModel, backgroundModel, ...rest }) => ({
    ...rest,
    defaultModel: legacyDefaultModel(defaultModel, defaultRunner) ?? DEFAULT_MODEL_SELECTION,
    backgroundModel: backgroundModelOf(backgroundModel, defaultRunner),
  }));
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const AiSettingsPatchSchema = z
  .object({
    location: AiRunnerLocationSchema.optional(),
    defaultRunner: AiRunnerKindSchema.optional(),
    defaultModel: AiModelSelectionInputSchema.optional(),
    backgroundModel: AiModelSelectionInputSchema.optional(),
    features: AiFeaturesSchema.partial().optional(),
  })
  .transform(({ defaultRunner, ...rest }) => {
    const defaultModel = legacyDefaultModel(rest.defaultModel, defaultRunner);
    return defaultModel === undefined ? rest : { ...rest, defaultModel };
  });

export const DEFAULT_AI_SETTINGS: AiSettings = {
  location: 'local',
  defaultModel: DEFAULT_MODEL_SELECTION,
  backgroundModel: DEFAULT_BACKGROUND_MODEL_SELECTION,
  features: { oneLiners: true, summaries: true, replySuggestions: true, jiraTriage: true },
};
