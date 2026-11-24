import { testInfra } from '@relay/config/test-infra';
import type { ImapAccountInput } from '../app/imap-account';
import type { GmailServer } from './gmail-server';

export const GMAIL_IMAP_HOST = 'imap.gmail.com';

export const gmailAccountInput = (gmail: GmailServer): ImapAccountInput => ({
  email: gmail.account.email,
  password: gmail.account.password,
  senderName: 'QA Relay',
  name: 'Gmail emulátor',
  imapHost: GMAIL_IMAP_HOST,
  imapPort: gmail.port,
  smtpHost: testInfra.greenmail.host,
  smtpPort: testInfra.greenmail.smtpPort,
});
