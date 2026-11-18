import { guessSettings, presetFor } from '../../lib/provider-presets';
import { type AccountFormValues, SERVER_FIELDS, serverFieldsOf } from './account-form';

export interface ServerSummary {
  readonly source: string;
  readonly endpoints: string;
}

const endpoint = (host: string, port: string): string =>
  port.trim() === '' ? host.trim() : `${host.trim()}:${port.trim()}`;

const matchesGuess = (values: AccountFormValues): boolean => {
  const guessed = guessSettings(values.email);
  if (guessed === null) {
    return false;
  }
  const expected = serverFieldsOf(guessed);
  return SERVER_FIELDS.every((field) => values[field].trim() === expected[field]);
};

const sourceOf = (values: AccountFormValues): string => {
  if (!matchesGuess(values)) {
    return 'Vlastné nastavenia';
  }
  return presetFor(values.email)?.preset.label ?? 'Podľa domény';
};

export const serverSummaryOf = (values: AccountFormValues): ServerSummary | null => {
  if (values.imapHost.trim() === '' || values.smtpHost.trim() === '') {
    return null;
  }
  return {
    source: sourceOf(values),
    endpoints: `${endpoint(values.imapHost, values.imapPort)} · ${endpoint(values.smtpHost, values.smtpPort)}`,
  };
};
