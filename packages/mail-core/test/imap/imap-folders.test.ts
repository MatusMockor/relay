import { NotImplementedError, type RemoteMailbox } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collect } from '../support/collect';
import { createProviderHarness, type ProviderHarness } from '../support/provider-harness';
import { rawMail } from '../support/raw-mail';

const byPath = (mailboxes: readonly RemoteMailbox[]): Map<string, RemoteMailbox> =>
  new Map(mailboxes.map((mailbox) => [mailbox.path, mailbox]));

describe('ImapMailProvider folders against GreenMail', () => {
  let harness: ProviderHarness;

  beforeEach(async () => {
    harness = await createProviderHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  const delimiterOf = async (): Promise<string> => {
    const inbox = (await harness.provider.listMailboxes()).find(({ path }) => path === 'INBOX');
    expect(inbox?.delimiter).toBeTruthy();
    return inbox?.delimiter ?? '';
  };

  it('lists a nested folder tree as custom mailboxes and leaves out the Noselect parent', async () => {
    const delimiter = await delimiterOf();
    const admin = await harness.admin();
    await admin.mailboxCreate('Klienti');
    await admin.mailboxCreate(['Klienti', 'Beta']);
    await admin.mailboxCreate(['Projekty', 'Alfa']);

    const mailboxes = byPath(await harness.provider.listMailboxes());

    expect([...mailboxes.keys()].sort()).toEqual([
      'INBOX',
      'Klienti',
      `Klienti${delimiter}Beta`,
      `Projekty${delimiter}Alfa`,
    ]);
    expect(mailboxes.get(`Klienti${delimiter}Beta`)).toEqual({
      path: `Klienti${delimiter}Beta`,
      name: 'Beta',
      delimiter,
      role: 'custom',
      subscribed: true,
    });
    expect(mailboxes.get(`Projekty${delimiter}Alfa`)?.role).toBe('custom');
  });

  it('reports which folders are subscribed', async () => {
    const admin = await harness.admin();
    await admin.mailboxCreate('Odber');
    await admin.mailboxCreate('Bez odberu');
    await admin.mailboxUnsubscribe('Bez odberu');

    const mailboxes = byPath(await harness.provider.listMailboxes());

    expect(mailboxes.get('Odber')?.subscribed).toBe(true);
    expect(mailboxes.get('Bez odberu')?.subscribed).toBe(false);
  });

  it('keeps UIDVALIDITY when a folder and its children are renamed', async () => {
    const delimiter = await delimiterOf();
    const admin = await harness.admin();
    await admin.mailboxCreate('Stare');
    await admin.mailboxCreate(['Stare', 'Dieta']);
    await harness.provider.append('Stare', rawMail({ to: harness.user.email, subject: 'a' }), {});
    const parent = await harness.provider.status('Stare');
    const child = await harness.provider.status(`Stare${delimiter}Dieta`);

    await admin.mailboxRename('Stare', 'Nove');

    const paths = (await harness.provider.listMailboxes()).map(({ path }) => path);
    expect(paths).toContain('Nove');
    expect(paths).toContain(`Nove${delimiter}Dieta`);
    expect(paths).not.toContain('Stare');
    const renamed = await harness.provider.status('Nove');
    expect(renamed.uidValidity).toBe(parent.uidValidity);
    expect(renamed.messages).toBe(1);
    expect((await harness.provider.status(`Nove${delimiter}Dieta`)).uidValidity).toBe(
      child.uidValidity,
    );
  });

  it('returns no Gmail labels and reads flag changes of selected UIDs only', async () => {
    const admin = await harness.admin();
    await admin.mailboxCreate('Priecinok');
    for (const subject of ['one', 'two', 'three']) {
      await harness.provider.append('Priecinok', rawMail({ to: harness.user.email, subject }), {});
    }

    const fetched = await collect(harness.provider.fetchSince('Priecinok', null));
    expect(fetched.map(({ labels }) => labels)).toEqual([null, null, null]);

    const changes = await collect(harness.provider.fetchFlagChanges('Priecinok', '0', [1, 3]));
    expect(changes.map(({ uid, labels }) => ({ uid, labels }))).toEqual([
      { uid: 1, labels: null },
      { uid: 3, labels: null },
    ]);
    expect(await collect(harness.provider.fetchFlagChanges('Priecinok', '0', []))).toEqual([]);
  });

  it('moves mail into a nested folder and rejects Gmail label writes', async () => {
    const delimiter = await delimiterOf();
    const folder = `Klienti${delimiter}Faktúry`;
    const admin = await harness.admin();
    await admin.mailboxCreate(['Klienti', 'Faktúry']);
    await harness.provider.append('INBOX', rawMail({ to: harness.user.email, subject: 'f' }), {});

    const moved = await harness.provider.move('INBOX', [1], folder);

    expect(moved.uidMap.get(1)).toBe(1);
    expect(await harness.provider.listUids('INBOX')).toEqual([]);
    expect(await harness.provider.listUids(folder)).toEqual([1]);
    await expect(
      harness.provider.setLabels(folder, [1], { add: ['Klienti'], remove: [] }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
});
