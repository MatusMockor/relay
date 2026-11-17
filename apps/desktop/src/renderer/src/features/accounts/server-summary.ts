import { presetFor } from '../../lib/provider-presets';
import type { AccountFormValues } from './account-form';

export interface ServerSummary {
  readonly source: string;
  readonly endpoints: string;
}

const endpoint = (host: string, port: string): string =>
  port.trim() === '' ? host.trim() : `${host.trim()}:${port.trim()}`;

export const serverSummaryOf = (values: AccountFormValues): ServerSummary | null => {
  if (values.imapHost.trim() === '' || values.smtpHost.trim() === '') {
    return null;
  }
  const preset = presetFor(values.email)?.preset;
  return {
    source: preset?.label ?? 'Podľa domény',
    endpoints: `${endpoint(values.imapHost, values.imapPort)} · ${endpoint(values.smtpHost, values.smtpPort)}`,
  };
};
