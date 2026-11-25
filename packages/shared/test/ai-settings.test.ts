import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BACKGROUND_MODEL_SELECTION,
  DEFAULT_USER_SETTINGS,
  UserSettingsPatchSchema,
  UserSettingsSchema,
} from '../src/domain';

const features = DEFAULT_USER_SETTINGS.ai.features;

describe('AI model settings', () => {
  const legacyAi = (defaultRunner: string, extra: object = {}) =>
    UserSettingsSchema.parse({
      notifications: 'off',
      density: 'normal',
      ai: { location: 'server', defaultRunner, features, ...extra },
    }).ai;

  it('upgrades settings stored with the legacy Codex runner to Codex models', () => {
    expect(legacyAi('codex')).toEqual({
      location: 'server',
      defaultModel: { runner: 'codex', model: null, effort: null },
      backgroundModel: { runner: 'codex', model: null, effort: 'low' },
      features,
    });
  });

  it('upgrades settings stored with the legacy Claude runner to Claude Haiku in the background', () => {
    expect(legacyAi('claude')).toMatchObject({
      defaultModel: { runner: 'claude', model: null, effort: null },
      backgroundModel: DEFAULT_BACKGROUND_MODEL_SELECTION,
    });
  });

  it('keeps a stored background model next to a legacy runner', () => {
    const backgroundModel = { runner: 'claude', model: 'claude-sonnet-5-5', effort: 'medium' };

    expect(legacyAi('codex', { backgroundModel }).backgroundModel).toEqual(backgroundModel);
  });

  it('gives new settings the Claude Haiku background model', () => {
    const fresh = { ...DEFAULT_USER_SETTINGS.ai, backgroundModel: undefined };

    expect(
      UserSettingsSchema.parse({ ...DEFAULT_USER_SETTINGS, ai: fresh }).ai.backgroundModel,
    ).toEqual(DEFAULT_BACKGROUND_MODEL_SELECTION);
  });

  it('prefers the default model over a leftover legacy runner', () => {
    const stored = {
      ...DEFAULT_USER_SETTINGS,
      ai: {
        ...DEFAULT_USER_SETTINGS.ai,
        defaultRunner: 'codex',
        defaultModel: { runner: 'claude', model: 'claude-sonnet-5-5', effort: 'high' },
      },
    };

    expect(UserSettingsSchema.parse(stored).ai.defaultModel).toEqual({
      runner: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
    });
  });

  it('defaults the background model to Claude Haiku with low effort', () => {
    expect(DEFAULT_USER_SETTINGS.ai.backgroundModel).toEqual({
      runner: 'claude',
      model: 'claude-haiku-5-5',
      effort: 'low',
    });
  });

  it('accepts whole model choices in a patch and upgrades a legacy runner patch', () => {
    const choice = { runner: 'codex', model: 'gpt-6-luna', effort: 'xhigh' } as const;

    expect(UserSettingsPatchSchema.parse({ ai: { backgroundModel: choice } })).toEqual({
      ai: { backgroundModel: choice },
    });
    expect(UserSettingsPatchSchema.parse({ ai: { defaultRunner: 'codex' } })).toEqual({
      ai: { defaultModel: { runner: 'codex', model: null, effort: null } },
    });
  });

  it('rejects a patch with a model of another runner or an unsupported effort', () => {
    const parse = (defaultModel: unknown) =>
      UserSettingsPatchSchema.safeParse({ ai: { defaultModel } }).success;

    expect(parse({ runner: 'claude', model: 'gpt-6-luna', effort: null })).toBe(false);
    expect(parse({ runner: 'codex', model: 'gpt-6-luna', effort: 'max' })).toBe(false);
    expect(parse({ runner: 'claude', model: null })).toBe(false);
  });
});
