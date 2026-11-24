export interface MailUser {
  readonly email: string;
  readonly password: string;
  readonly host: string;
  readonly imapPort: number;
  readonly smtpPort: number;
}
