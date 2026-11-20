import { describe, expect, it } from 'vitest';
import { deliverMail, standardServer } from '../support/fixtures';
import { FakeMailProvider } from '../support/mail/fake-mail-provider';
import type { FakeMailServer } from '../support/mail/fake-mail-server';

const connectedProvider = async (server: FakeMailServer): Promise<FakeMailProvider> => {
  const provider = new FakeMailProvider(server, { kind: 'password', password: server.password });
  await provider.connect();
  return provider;
};

describe('FakeMailProvider summaries', () => {
  it('derives header, snippet, flags and calendar attachments from the stored source', async () => {
    const server = standardServer();
    const uid = deliverMail(server, 'INBOX', {
      id: 'm1',
      body: 'Ahoj   svet',
      seen: true,
      keywords: ['Projekt'],
      headers: { 'X-Test-Calendar': 'evt-1' },
    });
    deliverMail(server, 'INBOX', { id: 'm2' });
    const provider = await connectedProvider(server);
    const { uidValidity } = await provider.status('INBOX');

    const summaries = await provider.fetchSummaries('INBOX', uidValidity, [uid, 99]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      uid,
      flags: { seen: true },
      keywords: ['Projekt'],
      snippet: 'Ahoj svet',
      attachments: [{ filename: 'invite.ics', contentType: 'text/calendar', inline: false }],
    });
    const header = new TextDecoder().decode(summaries[0]?.header);
    expect(header).toContain('Message-ID: <m1@mail.test>');
    expect(header.endsWith('\r\n\r\n')).toBe(true);
    await expect(provider.fetchSummaries('INBOX', uidValidity + 1, [uid])).rejects.toThrow();
  });

  it('lists only UIDs inside a requested range', async () => {
    const server = standardServer();
    const uids = ['a', 'b', 'c', 'd'].map((id) => deliverMail(server, 'INBOX', { id }));
    const provider = await connectedProvider(server);

    await expect(
      provider.listUids('INBOX', { range: { from: uids[1] ?? 0, to: uids[2] ?? 0 } }),
    ).resolves.toEqual(uids.slice(1, 3));
    await expect(provider.listUids('INBOX')).resolves.toEqual(uids);
  });
});
