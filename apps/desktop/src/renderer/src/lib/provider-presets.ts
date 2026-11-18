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

const GMX_NOTE = 'Ak máš v GMX zapnuté dvojfázové overenie, použi heslo aplikácie.';

const NOTES: Partial<Record<ProviderPresetId, string>> = {
  gmail: 'Pri IMAP použi heslo aplikácie.',
  icloud: 'iCloud vyžaduje heslo pre aplikáciu.',
  gmx: GMX_NOTE,
  gmxcom: GMX_NOTE,
  zoho: 'Ak máš v Zoho zapnuté dvojfázové overenie, použi heslo aplikácie.',
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
