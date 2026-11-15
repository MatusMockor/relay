import { EmailAddressSchema, type ImapSmtpSettings } from '@relay/shared';
import { guessSettings } from '../../lib/provider-presets';

export interface AccountFormValues {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly imapHost: string;
  readonly imapPort: string;
  readonly smtpHost: string;
  readonly smtpPort: string;
}

export const EMPTY_ACCOUNT_FORM: AccountFormValues = {
  email: '',
  password: '',
  name: '',
  imapHost: '',
  imapPort: '993',
  smtpHost: '',
  smtpPort: '465',
};

export const withGuessedServers = (
  values: AccountFormValues,
  previousEmail: string,
): AccountFormValues => {
  const guessed = guessSettings(values.email);
  const previous = guessSettings(previousEmail);
  const untouched = values.imapHost === '' || values.imapHost === previous?.imap.host;
  if (guessed === null || !untouched) {
    return values;
  }
  return {
    ...values,
    imapHost: guessed.imap.host,
    imapPort: String(guessed.imap.port),
    smtpHost: guessed.smtp.host,
    smtpPort: String(guessed.smtp.port),
  };
};

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const IPV4 = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;

const isValidHost = (host: string): boolean =>
  host.toLowerCase() === 'localhost' || IPV4.test(host) || DOMAIN.test(host);

export type FormResult =
  | { readonly ok: true; readonly settings: ImapSmtpSettings }
  | { readonly ok: false; readonly error: string; readonly field: keyof AccountFormValues };

const portOf = (value: string): number | null =>
  /^\d{2,5}$/.test(value.trim()) && Number(value) <= 65_535 ? Number(value) : null;

export const validateAccountForm = (values: AccountFormValues): FormResult => {
  if (!EmailAddressSchema.safeParse(values.email.trim()).success) {
    return {
      ok: false,
      error: 'Zadaj platnú e-mailovú adresu, napríklad meno@firma.sk.',
      field: 'email',
    };
  }
  if (values.password === '') {
    return { ok: false, error: 'Doplň heslo k schránke.', field: 'password' };
  }
  if (!isValidHost(values.imapHost.trim())) {
    return { ok: false, error: 'Doplň IMAP server, napríklad imap.firma.sk.', field: 'imapHost' };
  }
  if (!isValidHost(values.smtpHost.trim())) {
    return { ok: false, error: 'Doplň SMTP server, napríklad smtp.firma.sk.', field: 'smtpHost' };
  }
  const imapPort = portOf(values.imapPort);
  const smtpPort = portOf(values.smtpPort);
  if (imapPort === null || smtpPort === null) {
    return {
      ok: false,
      error: 'Port musí byť číslo, zvyčajne 993 pre IMAP a 465 alebo 587 pre SMTP.',
      field: imapPort === null ? 'imapPort' : 'smtpPort',
    };
  }
  return {
    ok: true,
    settings: {
      imap: { host: values.imapHost.trim(), port: imapPort, secure: imapPort === 993 },
      smtp: { host: values.smtpHost.trim(), port: smtpPort, secure: smtpPort === 465 },
      username: values.email.trim(),
    },
  };
};
