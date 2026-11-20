import { supportedAutomations } from '@relay/shared/domain';
import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import {
  createGreenMailUser,
  deleteGreenMailUser,
  listSubjects,
  openImap,
  rawMail,
} from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const JIRA_SUBJECT = '[JIRA] (CMS-217) Editor stráca obrázky po uložení konceptu';

const jiraMail = (to: string): Buffer =>
  Buffer.from(
    [
      'From: "Peter Kral (Jira)" <jira@company.atlassian.net>',
      `To: ${to}`,
      'Subject: =?UTF-8?B?' + Buffer.from(JIRA_SUBJECT).toString('base64') + '?=',
      `Message-ID: <JIRA.${randomUUID()}@company.atlassian.net>`,
      `Date: ${new Date().toUTCString()}`,
      'X-JIRA-FingerPrint: 1234',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Peter Kral assigned CMS-217 to you.',
      '',
    ].join('\r\n'),
  );

describe('accounts with only an INBOX on the IMAP server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let partner: GreenMailUser;
  let ownerImap: ImapFlow;
  let partnerImap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('inboxonly');
    partner = await createGreenMailUser('partner');
    ownerImap = await openImap(owner);
    partnerImap = await openImap(partner);
    for (const subject of ['Invoice 42', 'Project kickoff', 'Spam offer']) {
      await ownerImap.append(
        'INBOX',
        rawMail({ from: partner.email, to: owner.email, subject, body: 'Hi!' }),
      );
    }
    await ownerImap.append('INBOX', jiraMail(owner.email));
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await partnerImap.logout();
    await Promise.all([owner, partner].map((user) => deleteGreenMailUser(user)));
  });

  it('creates Archive, Trash and Sent on first use and mirrors the actions', async () => {
    const session = await registerUser(app.api, `inbox-only-${owner.email}`);
    const token = session.accessToken;
    const rules = supportedAutomations(await app.api.ok(api.automations.list, {}, token));
    supportedAutomations(
      await app.api.ok(
        api.automations.replace,
        { body: { automations: rules.map((rule) => ({ ...rule, enabled: true })) } },
        token,
      ),
    );
    const account = await addImapAccount(app.api, token, owner);
    const threads = await waitForInbox(app.api, token, (items) => items.length === 4);
    const bySubject = (subject: string) => threads.find((thread) => thread.subject === subject);
    const invoice = bySubject('Invoice 42');
    const kickoff = bySubject('Project kickoff');
    const spam = bySubject('Spam offer');
    expect([invoice, kickoff, spam].every((thread) => thread !== undefined)).toBe(true);
    if (invoice === undefined || kickoff === undefined || spam === undefined) {
      return;
    }
    const before = await app.api.ok(api.accounts.mailboxes, { params: { id: account.id } }, token);
    expect(before.map((mailbox) => mailbox.role)).toEqual(['inbox']);

    await app.api.ok(
      api.threads.action,
      { params: { id: invoice.id }, body: { type: 'done' } },
      token,
    );
    await app.api.ok(
      api.threads.action,
      { params: { id: spam.id }, body: { type: 'trash' } },
      token,
    );

    expect(await listSubjects(ownerImap, 'Archive')).toEqual(['Invoice 42']);
    expect(await listSubjects(ownerImap, 'Trash')).toEqual(['Spam offer']);
    expect(await listSubjects(ownerImap, 'INBOX')).not.toContain('Invoice 42');

    const detail = await app.api.ok(api.threads.get, { params: { id: kickoff.id } }, token);
    const sent = await app.api.ok(
      api.compose.send,
      {
        body: {
          source: 'inline',
          draft: {
            accountId: account.id,
            to: [{ name: null, email: partner.email }],
            cc: [],
            bcc: [],
            subject: 'Re: Project kickoff',
            body: 'Sounds good.',
            inReplyToThreadId: kickoff.id,
            inReplyToMessageId: detail.messages[0]?.id ?? null,
          },
        },
      },
      token,
    );
    expect(sent).toMatchObject({ status: 'sent', threadId: kickoff.id });
    expect(await listSubjects(ownerImap, 'Sent')).toEqual(['Re: Project kickoff']);
    await expect
      .poll(() => listSubjects(partnerImap, 'INBOX'), { timeout: 10_000 })
      .toContain('Re: Project kickoff');

    const after = await app.api.ok(api.accounts.mailboxes, { params: { id: account.id } }, token);
    expect(after.map((mailbox) => [mailbox.path, mailbox.role]).sort()).toEqual([
      ['Archive', 'archive'],
      ['INBOX', 'inbox'],
      ['Sent', 'sent'],
      ['Trash', 'trash'],
    ]);
    app.clock.advance(1000);
    const resyncedAt = app.clock.now().toISOString();
    await app.api.ok(api.sync.now, { body: { accountId: account.id } }, token);
    await expect
      .poll(
        async () => {
          const accounts = await app.api.ok(api.accounts.list, {}, token);
          return accounts.find((item) => item.id === account.id)?.lastSyncedAt;
        },
        { timeout: 10_000 },
      )
      .toBe(resyncedAt);
    const done = await app.api.ok(api.threads.list, { query: { view: 'done' } }, token);
    expect(done.items.map((thread) => thread.id)).toEqual([invoice.id]);

    const tasks = await app.api.ok(api.tasks.list, { query: {} }, token);
    expect(tasks.items.map((task) => [task.jiraKey, task.title])).toEqual([
      ['CMS-217', 'Editor stráca obrázky po uložení konceptu'],
    ]);
    const jiraThread = threads.find((thread) => thread.jiraKey === 'CMS-217');
    expect(jiraThread?.subject).toBe(JIRA_SUBJECT);
  }, 60_000);
});
