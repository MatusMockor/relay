import type { ImapSmtpSettings, MailProviderKind } from '@relay/shared/domain';
import { findPresetByDomain, type ProviderPresetId } from './provider-presets';

export interface GuessedSettings {
  readonly presetId: ProviderPresetId | null;
  readonly provider: MailProviderKind;
  readonly settings: ImapSmtpSettings;
  readonly confidence: 'preset' | 'heuristic';
}

const domainOf = (email: string): string | null => {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) {
    return null;
  }
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
};

export const guessSettings = (email: string): GuessedSettings | null => {
  const username = email.trim();
  const domain = domainOf(username);
  if (!domain) {
    return null;
  }
  const preset = findPresetByDomain(domain);
  if (preset) {
    return {
      presetId: preset.id,
      provider: preset.provider,
      settings: { imap: preset.imap, smtp: preset.smtp, username },
      confidence: 'preset',
    };
  }
  return {
    presetId: null,
    provider: 'imap',
    settings: {
      imap: { host: `imap.${domain}`, port: 993, secure: true },
      smtp: { host: `smtp.${domain}`, port: 465, secure: true },
      username,
    },
    confidence: 'heuristic',
  };
};
