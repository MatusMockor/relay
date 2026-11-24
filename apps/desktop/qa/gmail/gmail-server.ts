import imapkit, { type IMAPServer } from 'imapkit';
import { CLIENT_LABEL, gmailStorage } from './gmail-layout';
import { createGmailMirror, type GmailMirror } from './gmail-mirror-plugin';

export interface GmailAccount {
  readonly email: string;
  readonly password: string;
}

export interface GmailServer {
  readonly server: IMAPServer;
  readonly mirror: GmailMirror;
  readonly host: string;
  readonly port: number;
  readonly account: GmailAccount;
  stop(): Promise<void>;
}

export interface GmailServerOptions {
  readonly account?: GmailAccount;
  readonly labels?: readonly string[];
  readonly port?: number;
}

const HOST = '127.0.0.1';

const PLUGINS: readonly string[] = [
  'ENABLE',
  'ID',
  'IDLE',
  'NAMESPACE',
  'UNSELECT',
  'UIDPLUS',
  'MOVE',
  'CONDSTORE',
  'ESEARCH',
  'UTF8=ACCEPT',
  'LIST-EXTENDED',
  'LIST-STATUS',
  'LITERAL-',
  'SPECIAL-USE',
  'X-GM-EXT-1',
];

export const DEFAULT_GMAIL_ACCOUNT: GmailAccount = {
  email: 'relay.qa@gmail.com',
  password: 'relay-qa-app-password',
};

export const startGmailServer = async (options: GmailServerOptions = {}): Promise<GmailServer> => {
  const account = options.account ?? DEFAULT_GMAIL_ACCOUNT;
  const mirror = createGmailMirror();
  const server = imapkit({
    storage: gmailStorage(options.labels ?? [CLIENT_LABEL]),
    plugins: [...PLUGINS, mirror.plugin],
    users: { [account.email]: { password: account.password } },
  });
  const port = await server.start(options.port ?? 0, HOST);
  return {
    server,
    mirror,
    host: HOST,
    port,
    account,
    stop: () => server.control.shutdown({ graceful: false }),
  };
};
