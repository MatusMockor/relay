import type { GreenMailUser } from '@relay/config/test-infra';
import { ProviderError } from '@relay/engine';
import { ImapFlow } from 'imapflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImapMailProvider } from '../../src';
import { createGreenMailUser, deleteGreenMailUser, greenmailImap } from '../support/greenmail';
import { rawMail } from '../support/raw-mail';
import { RecordingClientFactory } from '../support/recording-client-factory';

describe('ImapMailProvider.move capability safety against GreenMail', () => {
  let user: GreenMailUser;
  let admin: ImapFlow;
  const providers: ImapMailProvider[] = [];

  const providerWithout = (capabilities: readonly string[]): ImapMailProvider => {
    const provider = new ImapMailProvider(new RecordingClientFactory(user, capabilities));
    providers.push(provider);
    return provider;
  };

  const inboxUids = async (): Promise<number[]> => {
    await admin.mailboxOpen('INBOX');
    const uids = await admin.search({ all: true }, { uid: true });
    expect(uids).not.toBe(false);
    return uids === false ? [] : uids;
  };

  beforeEach(async () => {
    user = await createGreenMailUser();
    admin = new ImapFlow({
      ...greenmailImap,
      auth: { user: user.login, pass: user.password },
      logger: false,
    });
    await admin.connect();
    await admin.mailboxCreate('Archive');
    await admin.append('INBOX', Buffer.from(rawMail({ to: user.email, subject: 'bystander' })), [
      '\\Deleted',
    ]);
    await admin.append('INBOX', Buffer.from(rawMail({ to: user.email, subject: 'move me' })));
  });

  afterEach(async () => {
    await Promise.all(providers.splice(0).map((provider) => provider.close()));
    await admin.logout();
    await deleteGreenMailUser(user);
  });

  it('refuses to move without MOVE and UIDPLUS instead of expunging other deleted messages', async () => {
    const provider = providerWithout(['MOVE', 'UIDPLUS']);

    const move = provider.move('INBOX', [2], 'Archive');

    await expect(move).rejects.toBeInstanceOf(ProviderError);
    await expect(move).rejects.toThrow(/neither MOVE nor UIDPLUS/);
    expect(await inboxUids()).toEqual([1, 2]);
    expect(await provider.listUids('Archive')).toEqual([]);
  });

  it('falls back to COPY and UID EXPUNGE with UIDPLUS and keeps other deleted messages', async () => {
    const provider = providerWithout(['MOVE']);

    const result = await provider.move('INBOX', [2], 'Archive');

    expect(result.uidMap.get(2)).toBe(1);
    expect(await inboxUids()).toEqual([1]);
    expect(await provider.listUids('Archive')).toEqual([1]);
  });

  it('keeps the source message when the COPY of the fallback is rejected', async () => {
    const provider = providerWithout(['MOVE']);

    await expect(provider.move('INBOX', [2], 'Missing')).rejects.toBeInstanceOf(ProviderError);
    expect(await inboxUids()).toEqual([1, 2]);
  });

  it('moves with UID MOVE on a rev2-only server that folds MOVE and UIDPLUS into the base', async () => {
    const factory = new RecordingClientFactory(user, ['MOVE', 'UIDPLUS', 'IMAP4rev1'], (client) => {
      const connect = client.connect.bind(client);
      client.connect = async () => {
        await connect();
        client.capabilities.set('IMAP4rev2', true);
      };
    });
    const provider = new ImapMailProvider(factory);
    providers.push(provider);

    await provider.move('INBOX', [2], 'Archive');

    expect(await inboxUids()).toEqual([1]);
    await admin.mailboxOpen('Archive');
    expect(await admin.search({ all: true }, { uid: true })).toEqual([1]);
  });

  it('fails when the server rejects UID MOVE', async () => {
    const provider = providerWithout([]);

    await expect(provider.move('INBOX', [2], 'Missing')).rejects.toThrow(/IMAP move was rejected/);
    expect(await inboxUids()).toEqual([1, 2]);
  });
});
