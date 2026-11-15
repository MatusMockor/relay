import { ImapSmtpSettingsSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { guessSettings, listProviderPresets, providerPresets } from '../../src';

describe('provider presets', () => {
  it('defines valid IMAP/SMTP endpoints for every preset', () => {
    expect(listProviderPresets().map((preset) => preset.id)).toEqual([
      'gmail',
      'outlook',
      'icloud',
      'yahoo',
      'seznam',
      'websupport',
      'zoznam',
      'azet',
      'pobox',
      'centrum',
    ]);
    for (const preset of listProviderPresets()) {
      expect(
        ImapSmtpSettingsSchema.safeParse({
          imap: preset.imap,
          smtp: preset.smtp,
          username: 'a@b.sk',
        }).success,
      ).toBe(true);
    }
    expect(providerPresets.gmail.imap).toEqual({ host: 'imap.gmail.com', port: 993, secure: true });
    expect(providerPresets.outlook.smtp).toEqual({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
    });
  });

  it.each([
    ['matus@gmail.com', 'gmail', 'gmail', 'imap.gmail.com'],
    ['Matus@GoogleMail.com', 'gmail', 'gmail', 'imap.gmail.com'],
    ['jan@hotmail.com', 'outlook', 'outlook', 'outlook.office365.com'],
    ['jan@me.com', 'icloud', 'imap', 'imap.mail.me.com'],
    ['jan@ymail.com', 'yahoo', 'imap', 'imap.mail.yahoo.com'],
    ['jan@email.cz', 'seznam', 'imap', 'imap.seznam.cz'],
  ])('uses the preset for %s', (email, presetId, provider, imapHost) => {
    const guess = guessSettings(email);

    expect(guess).toMatchObject({ presetId, provider, confidence: 'preset' });
    expect(guess?.settings.imap.host).toBe(imapHost);
    expect(guess?.settings.username).toBe(email);
  });

  it('maps pobox.sk to its own IMAP host and the Centrum SMTP host', () => {
    expect(guessSettings('jana@pobox.sk')).toMatchObject({
      presetId: 'pobox',
      settings: {
        imap: { host: 'imap.pobox.sk', port: 993, secure: true },
        smtp: { host: 'smtp.centrum.sk', port: 465, secure: true },
      },
    });
  });

  it('falls back to imap.<domain> and smtp.<domain> for unknown domains', () => {
    expect(guessSettings(' peter@Firma.sk ')).toEqual({
      presetId: null,
      provider: 'imap',
      confidence: 'heuristic',
      settings: {
        imap: { host: 'imap.firma.sk', port: 993, secure: true },
        smtp: { host: 'smtp.firma.sk', port: 465, secure: true },
        username: 'peter@Firma.sk',
      },
    });
  });

  it.each(['', 'no-at-sign', '@firma.sk', 'peter@'])('returns null for "%s"', (email) => {
    expect(guessSettings(email)).toBeNull();
  });
});

describe('browser-safe presets entry', () => {
  it('exposes the presets without the IMAP and SMTP adapters', async () => {
    const presets = await import('@relay/mail-core/presets');

    expect(presets.findPresetByDomain('post.sk')?.id).toBe('azet');
    expect(presets.guessSettings('jana@atlas.sk')).toMatchObject({
      presetId: 'centrum',
      settings: { imap: { host: 'imap.centrum.sk', port: 993, secure: true } },
    });
    expect(presets.providerPresets.zoznam.smtp).toEqual({
      host: 'smtp.zoznam.sk',
      port: 465,
      secure: true,
    });
    expect(Object.keys(presets).sort()).toEqual([
      'findPresetByDomain',
      'guessSettings',
      'listProviderPresets',
      'providerPresets',
    ]);
  });
});
