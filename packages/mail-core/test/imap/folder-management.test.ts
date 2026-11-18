import { ProviderError, type RemoteMailbox } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { passwordCredentials } from '../support/accounts';
import {
  createProvider,
  createProviderHarness,
  type ProviderHarness,
} from '../support/provider-harness';
import { rawMail } from '../support/raw-mail';

const byPath = (mailboxes: readonly RemoteMailbox[]): Map<string, RemoteMailbox> =>
  new Map(mailboxes.map((mailbox) => [mailbox.path, mailbox]));

describe('folder management against GreenMail', () => {
  let harness: ProviderHarness;

  beforeEach(async () => {
    harness = await createProviderHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it('creates a folder nested under its parent with the server delimiter', async () => {
    const parent = await harness.provider.createMailbox('Klienti');
    const delimiter = parent.delimiter ?? '';

    const child = await harness.provider.createMailbox('Účtovníctvo', 'Klienti');

    expect(delimiter).not.toBe('');
    expect(child).toEqual({
      path: `Klienti${delimiter}Účtovníctvo`,
      name: 'Účtovníctvo',
      delimiter,
      role: 'custom',
      subscribed: true,
    });
    await expect(harness.provider.createMailbox('X', 'Neexistuje')).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it('renames a folder with its subfolders and keeps UIDVALIDITY, mail and subscriptions', async () => {
    const parent = await harness.provider.createMailbox('Projekty');
    const delimiter = parent.delimiter ?? '';
    await harness.provider.createMailbox('Alfa', 'Projekty');
    await harness.provider.createMailbox('Beta', 'Projekty');
    const alfa = `Projekty${delimiter}Alfa`;
    await harness.provider.append(alfa, rawMail({ to: harness.user.email, subject: 'v1' }), {});
    const before = await harness.provider.status(alfa);

    const renamed = await harness.provider.renameMailbox('Projekty', 'Archív');

    expect(renamed).toMatchObject({ path: 'Archív', name: 'Archív', subscribed: true });
    const listed = byPath(await harness.provider.listMailboxes());
    expect([...listed.keys()].filter((path) => path !== 'INBOX').sort()).toEqual([
      'Archív',
      `Archív${delimiter}Alfa`,
      `Archív${delimiter}Beta`,
    ]);
    expect(listed.get(`Archív${delimiter}Alfa`)?.subscribed).toBe(true);
    expect(listed.get(`Archív${delimiter}Beta`)?.subscribed).toBe(true);
    const after = await harness.provider.status(`Archív${delimiter}Alfa`);
    expect(after.uidValidity).toBe(before.uidValidity);
    expect(await harness.provider.listUids(`Archív${delimiter}Alfa`)).toEqual([1]);
  });

  it('deletes a folder', async () => {
    await harness.provider.createMailbox('Smeti');

    await harness.provider.deleteMailbox('Smeti');

    const paths = (await harness.provider.listMailboxes()).map((mailbox) => mailbox.path);
    expect(paths).toEqual(['INBOX']);
  });

  it('rejects renaming onto an existing folder and deleting a missing one', async () => {
    await harness.provider.createMailbox('Projekty');
    await harness.provider.createMailbox('Klienti');

    await expect(harness.provider.renameMailbox('Projekty', 'Klienti')).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(harness.provider.renameMailbox('Neexistuje', 'Iné')).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(harness.provider.deleteMailbox('Neexistuje')).rejects.toBeInstanceOf(
      ProviderError,
    );
    const paths = (await harness.provider.listMailboxes()).map((mailbox) => mailbox.path).sort();
    expect(paths).toEqual(['INBOX', 'Klienti', 'Projekty']);
  });

  it('sees mail another client added to the selected folder when asked for a fresh listing', async () => {
    await harness.provider.createMailbox('Smeti');
    expect(await harness.provider.listUids('Smeti')).toEqual([]);
    const other = createProvider(harness.account, passwordCredentials(harness.user));
    await other.append('Smeti', rawMail({ to: harness.user.email, subject: 'neskoro' }), {});
    await other.close();

    expect(await harness.provider.listUids('Smeti', { fresh: true })).toEqual([1]);
  });
});
