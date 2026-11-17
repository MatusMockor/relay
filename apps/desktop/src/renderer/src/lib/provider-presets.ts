import type { ImapSmtpSettings } from '@relay/shared';
import {
  findPresetByDomain,
  guessSettings as guessPresetSettings,
  type ProviderPreset,
  type ProviderPresetId,
} from '@relay/mail-core/presets';

export interface PresetHint {
  readonly preset: ProviderPreset;
  readonly note?: string;
}

const NOTES: Partial<Record<ProviderPresetId, string>> = {
  gmail: 'Odporúčame Prihlásiť cez Google. Pri IMAP použi heslo aplikácie.',
  icloud: 'iCloud vyžaduje heslo pre aplikáciu.',
};

const COMPLETE_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

export const domainOf = (email: string): string => (email.split('@')[1] ?? '').trim().toLowerCase();

export const presetFor = (email: string): PresetHint | null => {
  const preset = findPresetByDomain(domainOf(email));
  if (preset === null) {
    return null;
  }
  const note =
    NOTES[preset.id] ??
    (preset.requiresAppPassword ? `${preset.label} vyžaduje heslo pre aplikáciu.` : undefined);
  return note === undefined ? { preset } : { preset, note };
};

export const guessSettings = (email: string): ImapSmtpSettings | null => {
  if (!COMPLETE_DOMAIN.test(domainOf(email))) {
    return null;
  }
  return guessPresetSettings(email)?.settings ?? null;
};
