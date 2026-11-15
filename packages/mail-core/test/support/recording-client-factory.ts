import type { GreenMailUser } from '@relay/config/test-infra';
import type { ImapFlow } from 'imapflow';
import { CredentialsMailAuthResolver, ImapClientFactory } from '../../src';
import type { ImapClientOverrides } from '../../src/imap/imap-client-factory';
import { buildAccount, passwordCredentials } from './accounts';
import { greenmailImap } from './greenmail';
import { createTokenProvider } from './provider-harness';

export class RecordingClientFactory extends ImapClientFactory {
  readonly created: ImapFlow[] = [];

  constructor(
    user: GreenMailUser,
    private readonly hiddenCapabilities: readonly string[] = [],
    private readonly prepare: (client: ImapFlow) => void = () => undefined,
  ) {
    super({
      endpoint: greenmailImap,
      allowPlaintext: true,
      auth: new CredentialsMailAuthResolver(
        buildAccount(user),
        passwordCredentials(user),
        createTokenProvider(),
      ),
    });
  }

  override async create(overrides?: ImapClientOverrides): Promise<ImapFlow> {
    const client = await super.create(overrides);
    const connect = client.connect.bind(client);
    client.connect = async () => {
      await connect();
      this.hiddenCapabilities.forEach((capability) => client.capabilities.delete(capability));
    };
    this.prepare(client);
    this.created.push(client);
    return client;
  }
}
