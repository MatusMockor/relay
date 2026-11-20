import type { MailAccount, Mailbox } from '@relay/shared';
import { assert, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { demoIds } from '../src/data/demo/seed/ids';
import type { DemoAccountKey } from '../src/data/demo/seed/types';
import { sectionKey, sidebarSections } from '../src/features/folders/sidebar-sections';

interface DemoAccount {
  readonly account: MailAccount;
  readonly mailboxes: readonly Mailbox[];
}

const demoAccount = async (key: DemoAccountKey): Promise<DemoAccount> => {
  const client = createDemoMailClient({ aiStepMs: 0 });
  const accountId = demoIds.account(key);
  const account = (await client.listAccounts()).find((candidate) => candidate.id === accountId);
  assert(account !== undefined, `missing demo account ${key}`);
  return { account, mailboxes: await client.listMailboxes(accountId) };
};

const systemOnly = (mailboxes: readonly Mailbox[]): Mailbox[] =>
  mailboxes.filter((mailbox) => mailbox.role !== 'custom');

describe('sidebar sections of an account', () => {
  it('offers folders for an IMAP account that only has system mailboxes', async () => {
    const { account, mailboxes } = await demoAccount('efa');

    const sections = sidebarSections({
      account,
      mailboxes: systemOnly(mailboxes),
      mailboxesLoaded: true,
      labelCount: 0,
    });

    expect(sections).toEqual({ folders: true, labels: true });
  });

  it('offers folders for an IMAP account whose mailbox list is still empty', async () => {
    const { account } = await demoAccount('fl');

    expect(
      sidebarSections({ account, mailboxes: [], mailboxesLoaded: true, labelCount: 0 }),
    ).toEqual({ folders: true, labels: true });
  });

  it('hides both sections while the mailboxes of an account without labels load', async () => {
    const { account } = await demoAccount('efa');

    expect(
      sidebarSections({ account, mailboxes: [], mailboxesLoaded: false, labelCount: 0 }),
    ).toEqual({ folders: false, labels: false });
  });

  it('keeps known labels visible while the mailboxes load', async () => {
    const { account } = await demoAccount('fl');

    expect(
      sidebarSections({ account, mailboxes: [], mailboxesLoaded: false, labelCount: 2 }).labels,
    ).toBe(true);
  });

  it('never offers folders for a Gmail account, only labels', async () => {
    const { account, mailboxes } = await demoAccount('os');

    expect(sidebarSections({ account, mailboxes, mailboxesLoaded: true, labelCount: 0 })).toEqual({
      folders: false,
      labels: true,
    });
  });

  it('treats an IMAP account that exposes Gmail label mailboxes as a labels account', async () => {
    const efabrica = await demoAccount('efa');
    const gmail = await demoAccount('os');

    const sections = sidebarSections({
      account: efabrica.account,
      mailboxes: gmail.mailboxes,
      mailboxesLoaded: true,
      labelCount: 0,
    });

    expect(sections.folders).toBe(false);
  });

  it('keys the collapse state per account and section', () => {
    const accountId = demoIds.account('efa');

    expect(sectionKey('mbx', accountId)).toBe(`sec:mbx:${accountId}`);
    expect(sectionKey('lbl', accountId)).toBe(`sec:lbl:${accountId}`);
  });
});
