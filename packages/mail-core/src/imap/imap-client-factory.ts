import type { ServerEndpoint } from '@relay/shared/domain';
import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import type { ConnectionOptions } from 'node:tls';
import type { MailAuth, MailAuthResolver } from '../auth/mail-auth';

export interface ImapTimeouts {
  readonly connectionMs: number;
  readonly greetingMs: number;
  readonly socketMs: number;
}

export const DEFAULT_IMAP_TIMEOUTS: ImapTimeouts = {
  connectionMs: 30_000,
  greetingMs: 16_000,
  socketMs: 5 * 60_000,
};

export interface ImapClientSettings {
  readonly endpoint: ServerEndpoint;
  readonly auth: MailAuthResolver;
  readonly timeouts?: ImapTimeouts;
  readonly tls?: ConnectionOptions;
  readonly allowPlaintext?: boolean;
}

export interface ImapClientOverrides {
  readonly autoIdleDelayMs?: number;
  readonly maxIdleTimeMs?: number;
}

const toImapAuth = (auth: MailAuth): NonNullable<ImapFlowOptions['auth']> => {
  if (auth.kind === 'password') {
    return { user: auth.user, pass: auth.password };
  }
  return { user: auth.user, accessToken: auth.accessToken };
};

const requireStartTls = (settings: ImapClientSettings): boolean =>
  !settings.endpoint.secure && settings.allowPlaintext !== true;

export class ImapClientFactory {
  constructor(private readonly settings: ImapClientSettings) {}

  async create(overrides: ImapClientOverrides = {}): Promise<ImapFlow> {
    const auth = await this.settings.auth.resolve();
    const timeouts = this.settings.timeouts ?? DEFAULT_IMAP_TIMEOUTS;
    return new ImapFlow({
      host: this.settings.endpoint.host,
      port: this.settings.endpoint.port,
      secure: this.settings.endpoint.secure,
      auth: toImapAuth(auth),
      tls: this.settings.tls,
      doSTARTTLS: requireStartTls(this.settings) ? true : undefined,
      logger: false,
      connectionTimeout: timeouts.connectionMs,
      greetingTimeout: timeouts.greetingMs,
      socketTimeout: timeouts.socketMs,
      autoIdleDelay: overrides.autoIdleDelayMs,
      maxIdleTime: overrides.maxIdleTimeMs,
    });
  }
}
