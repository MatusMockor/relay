import type { ServerEndpoint } from '@relay/shared/domain';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { ConnectionOptions } from 'node:tls';
import type { MailAuth } from '../auth/mail-auth';

export interface SmtpTimeouts {
  readonly connectionMs: number;
  readonly greetingMs: number;
  readonly socketMs: number;
}

export const DEFAULT_SMTP_TIMEOUTS: SmtpTimeouts = {
  connectionMs: 30_000,
  greetingMs: 30_000,
  socketMs: 120_000,
};

export interface SmtpTransportSettings {
  readonly endpoint: ServerEndpoint;
  readonly auth: MailAuth;
  readonly timeouts: SmtpTimeouts;
  readonly tls?: ConnectionOptions;
  readonly allowPlaintext?: boolean;
}

const toSmtpAuth = (auth: MailAuth): SMTPTransport.Options['auth'] => {
  if (auth.kind === 'password') {
    return { type: 'login', user: auth.user, pass: auth.password };
  }
  return { type: 'OAuth2', user: auth.user, accessToken: auth.accessToken };
};

export const createSmtpTransport = (
  settings: SmtpTransportSettings,
): Transporter<SMTPTransport.SentMessageInfo> =>
  createTransport({
    host: settings.endpoint.host,
    port: settings.endpoint.port,
    secure: settings.endpoint.secure,
    auth: toSmtpAuth(settings.auth),
    tls: settings.tls,
    requireTLS: !settings.endpoint.secure && settings.allowPlaintext !== true,
    connectionTimeout: settings.timeouts.connectionMs,
    greetingTimeout: settings.timeouts.greetingMs,
    socketTimeout: settings.timeouts.socketMs,
  });
