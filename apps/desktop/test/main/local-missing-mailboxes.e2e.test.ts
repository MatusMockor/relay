import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { type AiJob, AiJobIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  subjectsIn,
} from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

describe('local mode with an INBOX-only IMAP account (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await deliverMail(mailbox, {
      from: 'Jana <jana@example.com>',
      subject: 'Faktúra za október',
      text: 'Posielam faktúru.',
    });
    await deliverMail(mailbox, {
      from: 'Peter <peter@example.com>',
      subject: 'Obed v piatok?',
      text: 'Ideme na obed?',
    });
    await deliverMail(mailbox, {
      from: 'Peter Kral (Jira) <jira@company.atlassian.net>',
      subject: '[JIRA] (CMS-217) Editor stráca obrázky po uložení konceptu',
      text: 'Peter Kral assigned CMS-217 to you.',
    });
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('creates Archive and Sent on first use and keeps Jira subjects out of task titles', async () => {
    const { bridge } = harness;
    const rules = expectOk(await bridge.invoke('local.automations.list'));
    expectOk(
      await bridge.invoke('local.automations.replace', {
        automations: rules.map((rule) => ({ ...rule, enabled: true })),
      }),
    );
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const page = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    const invoice = page.items.find((thread) => thread.subject === 'Faktúra za október');
    const lunch = page.items.find((thread) => thread.subject === 'Obed v piatok?');
    expect(invoice).toBeDefined();
    expect(lunch).toBeDefined();
    if (invoice === undefined || lunch === undefined) {
      return;
    }

    expectOk(
      await bridge.invoke('local.threads.action', {
        threadId: invoice.id,
        action: { type: 'done' },
      }),
    );
    expect(await subjectsIn(mailbox, 'Archive')).toEqual(['Faktúra za október']);
    expect(await subjectsIn(mailbox, 'INBOX')).not.toContain('Faktúra za október');

    const detail = expectOk(await bridge.invoke('local.threads.get', { threadId: lunch.id }));
    const sent = expectOk(
      await bridge.invoke('local.send', {
        source: 'inline',
        draft: {
          accountId: account.id,
          to: [{ name: null, email: 'peter@example.com' }],
          cc: [],
          bcc: [],
          subject: 'Re: Obed v piatok?',
          body: 'Jasné.',
          inReplyToThreadId: lunch.id,
          inReplyToMessageId: detail.messages[0]?.id ?? null,
        },
      }),
    );
    expect(sent).toMatchObject({ status: 'sent', threadId: lunch.id });
    expect(await subjectsIn(mailbox, 'Sent')).toEqual(['Re: Obed v piatok?']);

    const mailboxes = expectOk(
      await bridge.invoke('local.accounts.mailboxes', { accountId: account.id }),
    );
    expect(mailboxes.map((entry) => [entry.path, entry.role]).sort()).toEqual([
      ['Archive', 'archive'],
      ['INBOX', 'inbox'],
      ['Sent', 'sent'],
    ]);
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const done = expectOk(await bridge.invoke('local.threads.list', { view: 'done' }));
    expect(done.items.map((thread) => thread.id)).toEqual([invoice.id]);

    const tasks = expectOk(await bridge.invoke('local.tasks.list', {}));
    expect(tasks.items.map((task) => [task.jiraKey, task.title])).toEqual([
      ['CMS-217', 'Editor stráca obrázky po uložení konceptu'],
    ]);
  });

  it('moves AI jobs queued for the server back to the local runner on start', async () => {
    const { runtime } = harness;
    const now = new Date().toISOString();
    const stuck: AiJob = {
      id: AiJobIdSchema.parse('aij_stuck'),
      userId: LOCAL_USER_ID,
      kind: 'rewrite',
      status: 'queued',
      runnerLocation: 'server',
      runner: 'claude',
      input: { kind: 'rewrite', text: 'ahoj', instruction: 'formálne', draftId: null },
      output: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await runtime.engine.repositories.aiJobs.create(stuck);

    await runtime.start();

    const job = await runtime.engine.repositories.aiJobs.findById(LOCAL_USER_ID, stuck.id);
    expect(job).toMatchObject({ status: 'queued', runnerLocation: 'local' });
    expect(await runtime.engine.services.ai.locationFor(LOCAL_USER_ID)).toBe('local');
  });
});
