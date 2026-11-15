import type { AiFeatures, AiTaskKind, UserSettings } from '@relay/shared/domain';
import { ForbiddenError } from '../../errors';

const FEATURE_OF: Readonly<Partial<Record<AiTaskKind, keyof AiFeatures>>> = {
  oneLiner: 'oneLiners',
  summary: 'summaries',
  replySuggestions: 'replySuggestions',
};

export const assertAiFeatureEnabled = (settings: UserSettings, kind: AiTaskKind): void => {
  const feature = FEATURE_OF[kind];
  if (feature === undefined || settings.ai.features[feature]) {
    return;
  }
  throw new ForbiddenError(`AI feature "${feature}" is turned off in settings`);
};
