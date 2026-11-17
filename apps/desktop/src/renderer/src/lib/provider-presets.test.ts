import { describe, expect, it } from 'vitest';
import { guessSettings, presetFor } from './provider-presets';

describe('provider presets', () => {
  it('uses the mail-core presets and adds Slovak notes', () => {
    expect(presetFor('meno@gmail.com')).toMatchObject({
      preset: { id: 'gmail', supportsOAuth: true },
      note: expect.stringContaining('Prihlásiť cez Google') as unknown,
    });
    expect(presetFor('ja@azet.sk')?.preset.id).toBe('azet');
    expect(presetFor('ja@firma.sk')).toBeNull();
  });

  it('asks for an app password for providers that require one', () => {
    expect(presetFor('ja@yahoo.com')?.note).toBe('Yahoo Mail vyžaduje heslo pre aplikáciu.');
    expect(presetFor('ja@aol.com')?.note).toBe('AOL Mail vyžaduje heslo pre aplikáciu.');
    expect(presetFor('ja@seznam.cz')?.note).toBeUndefined();
  });

  it('guesses settings only for complete domains', () => {
    expect(guessSettings('ja@azet.sk')?.imap.host).toBe('imap.azet.sk');
    expect(guessSettings('ja@firma.sk')).toEqual({
      imap: { host: 'imap.firma.sk', port: 993, secure: true },
      smtp: { host: 'smtp.firma.sk', port: 465, secure: true },
      username: 'ja@firma.sk',
    });
    expect(guessSettings('ja@firma')).toBeNull();
    expect(guessSettings('neplatny')).toBeNull();
  });
});
