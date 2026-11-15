import type { GreenMailUser } from '@relay/config/test-infra';
import { ProviderError } from '@relay/engine';
import { ImapFlow } from 'imapflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImapMailProvider, PartialMoveError } from '../../src';
import { createGreenMailUser, deleteGreenMailUser, greenmailImap } from '../support/greenmail';
import { rawMail } from '../support/raw-mail';
import { RecordingClientFactory } from '../support/recording-client-factory';

type ExpungeFault = (expunge: ImapFlow['messageDelete'], call: number) => ImapFlow['messageDelete'];

const rejectFirst: ExpungeFault = (expunge, call) =>
  call === 1 ? () => Promise.resolve(false) : expunge;
const rejectAll: ExpungeFault = () => () => Promise.resolve(false);
const expungeThenReject: ExpungeFault = (expunge, call) =>
  call === 1 ? async (...args) => (await expunge(...args)) && false : expunge;

describe('ImapMailProvider.move fallback rollback against GreenMail', () => {
  let user: GreenMailUser;
  let admin: ImapFlow;
  const providers: ImapMailProvider[] = [];

  const providerWith = (
    fault: ExpungeFault,
    beforeRestore: () => Promise<void> = () => Promise.resolve(),
  ): ImapMailProvider => {
    const factory = new RecordingClientFactory(user, ['MOVE'], (client) => {
      const expunge = client.messageDelete.bind(client);
      const unflag = client.messageFlagsRemove.bind(client);
      let calls = 0;
      client.messageDelete = (...args) => {
        calls += 1;
        return fault(expunge, calls)(...args);
      };
      client.messageFlagsRemove = async (...args) => {
        await beforeRestore();
        return unflag(...args);
      };
    });
    const provider = new ImapMailProvider(factory);
    providers.push(provider);
    return provider;
  };

  const flagsOf = async (path: string): Promise<Record<number, string[]>> => {
    await admin.mailboxOpen(path);
    const messages = await admin.fetchAll('1:*', { uid: true, flags: true }, { uid: true });
    return Object.fromEntries(
      messages.map((message) => [message.uid, [...(message.flags ?? new Set<string>())].sort()]),
    );
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
    await admin.append('INBOX', Buffer.from(rawMail({ to: user.email, subject: 'stay' })));
    await admin.append('INBOX', Buffer.from(rawMail({ to: user.email, subject: 'move me' })));
  });

  afterEach(async () => {
    await Promise.all(providers.splice(0).map((provider) => provider.close()));
    await admin.logout();
    await deleteGreenMailUser(user);
  });

  it('rolls the copy back when the source EXPUNGE fails, so a replay does not duplicate it', async () => {
    const provider = providerWith(rejectFirst);

    const failed = provider.move('INBOX', [2], 'Archive');

    await expect(failed).rejects.toBeInstanceOf(ProviderError);
    await expect(failed).rejects.not.toBeInstanceOf(PartialMoveError);
    await expect(failed).rejects.toThrow(/rolled back/);
    expect(await provider.listUids('Archive')).toEqual([]);
    expect(await flagsOf('INBOX')).toEqual({ 1: [], 2: [] });

    const replayed = await provider.move('INBOX', [2], 'Archive');

    expect(replayed.uidMap.get(2)).toBe(2);
    expect(await provider.listUids('Archive')).toEqual([2]);
    expect(await provider.listUids('INBOX')).toEqual([1]);
  });

  it('reports the retained copies when the rollback itself fails', async () => {
    const provider = providerWith(rejectAll);

    const failed = provider.move('INBOX', [2], 'Archive');

    await expect(failed).rejects.toBeInstanceOf(PartialMoveError);
    await expect(failed).rejects.toMatchObject({
      sourcePath: 'INBOX',
      targetPath: 'Archive',
      uidMap: new Map([[2, 1]]),
    });
    expect(await provider.listUids('Archive')).toEqual([1]);
    expect(await provider.listUids('INBOX')).toEqual([1, 2]);
  });

  it('keeps the copy when another client expunges the source during the rollback', async () => {
    const provider = providerWith(rejectFirst, async () => {
      await admin.mailboxOpen('INBOX');
      await admin.messageDelete('2', { uid: true });
    });

    const result = await provider.move('INBOX', [2], 'Archive');

    expect(result.uidMap).toEqual(new Map([[2, 1]]));
    expect(await provider.listUids('INBOX')).toEqual([1]);
    expect(await provider.listUids('Archive')).toEqual([1]);
  });

  it('never expunges by stale UIDs when the target mailbox was recreated before the rollback', async () => {
    const recreateArchive: ExpungeFault = (expunge, call) => {
      if (call !== 1) {
        return expunge;
      }
      return async () => {
        await admin.mailboxDelete('Archive');
        await new Promise((resolve) => setTimeout(resolve, 1_100));
        await admin.mailboxCreate('Archive');
        await admin.append('Archive', Buffer.from(rawMail({ to: user.email, subject: 'other' })));
        return false;
      };
    };
    const provider = providerWith(recreateArchive);

    await expect(provider.move('INBOX', [2], 'Archive')).rejects.toBeInstanceOf(PartialMoveError);
    expect(await provider.listUids('Archive')).toEqual([1]);
    const kept = await provider.fetchMessage('Archive', 1);
    expect(new TextDecoder().decode(kept?.source)).toContain('Subject: other');
  });

  it('treats the move as done when the EXPUNGE happened but its reply was lost', async () => {
    const provider = providerWith(expungeThenReject);

    const result = await provider.move('INBOX', [2], 'Archive');

    expect(result.uidMap).toEqual(new Map([[2, 1]]));
    expect(await provider.listUids('INBOX')).toEqual([1]);
    expect(await provider.listUids('Archive')).toEqual([1]);
  });
});
