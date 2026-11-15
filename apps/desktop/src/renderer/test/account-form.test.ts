import { describe, expect, it } from 'vitest';
import {
  EMPTY_ACCOUNT_FORM,
  validateAccountForm,
  type AccountFormValues,
} from '../src/features/accounts/account-form';

const formWith = (host: string): AccountFormValues => ({
  ...EMPTY_ACCOUNT_FORM,
  email: 'meno@firma.sk',
  password: 'tajne',
  imapHost: host,
  smtpHost: host,
});

describe('validateAccountForm', () => {
  it.each(['imap.firma.sk', 'mail.example.co.uk', '127.0.0.1', '192.168.1.110', 'localhost'])(
    'accepts %s as a mail server host',
    (host) => {
      expect(validateAccountForm(formWith(host)).ok).toBe(true);
    },
  );

  it.each(['', 'imap', '999.1.1.1', 'imap..firma.sk', '-imap.firma.sk', 'imap firma.sk'])(
    'rejects %j as a mail server host',
    (host) => {
      const result = validateAccountForm(formWith(host));
      expect(result.ok).toBe(false);
      expect(result.ok ? null : result.field).toBe('imapHost');
    },
  );
});
