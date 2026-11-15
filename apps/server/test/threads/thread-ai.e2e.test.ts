import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { authenticateRealtime } from '../support/realtime-client';
import {
  installStubClaudeByTask,
  REPLY_TASK,
  type StubClaudeByTask,
  SUMMARY_TASK,
} from '../support/stub-claude-by-task';
import { startTestApp, type TestApp } from '../support/test-app';

const SUMMARY = JSON.stringify({
  summary: 'Jana posiela zmluvu na podpis.',
  checklist: ['Prečítať zmluvu', 'Podpísať do piatku'],
});
const REPLIES = JSON.stringify({
  suggestions: [
    { label: 'Podpíšem', body: 'Ďakujem, podpíšem do piatku.' },
    { label: 'Mám otázku', body: 'Pred podpisom mám jednu otázku.' },
    { label: 'Neskôr', body: 'Pozriem sa na to budúci týždeň.' },
  ],
});

describe('POST /threads/:id/ai/prepare', () => {
  let app: TestApp;
  let claude: StubClaudeByTask;
  let owner: GreenMailUser;

  beforeAll(async () => {
    claude = await installStubClaudeByTask([
      { when: SUMMARY_TASK, answer: SUMMARY },
      { when: REPLY_TASK, answer: REPLIES },
    ]);
    app = await startTestApp({ env: { JOBS_ENABLED: 'true', AI_CLI_PATH: claude.dir } });
    owner = await createGreenMailUser('thread-ai');
    const imap = await openImap(owner);
    await imap.append(
      'INBOX',
      rawMail({ from: 'jana@klient.sk', to: owner.email, subject: 'Zmluva', body: 'Podpíšte' }),
    );
    await imap.append(
      'INBOX',
      rawMail({
        from: 'Jira <jira@acme.atlassian.net>',
        to: owner.email,
        subject: '[JIRA] (CMS-217) Editor stráca obrázky',
        body: 'Peter Novák mentioned you on CMS-217\r\n\r\nhttps://acme.atlassian.net/browse/CMS-217',
      }),
    );
    await imap.logout();
  });

  afterAll(async () => {
    await app.close();
    await claude.dispose();
    await deleteGreenMailUser(owner);
  });

  it('queues the summary and reply suggestions once and fills the thread detail', async () => {
    const session = await registerUser(app.api, `ai-open-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    await app.api.ok(
      api.settings.update,
      { body: { ai: { features: { oneLiners: false } } } },
      token,
    );
    await addImapAccount(app.api, token, owner);
    const threads = await waitForInbox(app.api, token, (items) => items.length === 2);
    const contract = threads.find((thread) => thread.subject === 'Zmluva');
    const jira = threads.find((thread) => thread.jiraKey === 'CMS-217');
    expect(jira?.jiraActor).toBe('Peter Novák');
    expect(contract).toBeDefined();
    if (contract === undefined) {
      return;
    }
    const socket = await authenticateRealtime(app.baseUrl, token);
    const params = { params: { id: contract.id } };

    expect(await app.api.ok(api.threads.prepareAi, params, token)).toMatchObject({
      pending: ['summary', 'replySuggestions'],
    });
    await app.api.ok(api.threads.prepareAi, params, token);

    await expect
      .poll(async () => (await app.api.ok(api.threads.get, params, token)).replySuggestions, {
        timeout: 20_000,
        interval: 250,
      })
      .toHaveLength(3);
    await expect
      .poll(async () => (await app.api.ok(api.threads.get, params, token)).aiSummary, {
        timeout: 20_000,
        interval: 250,
      })
      .toBe('Jana posiela zmluvu na podpis.');
    const detail = await app.api.ok(api.threads.get, params, token);
    expect(detail.checklist.map((item) => item.text)).toEqual([
      'Prečítať zmluvu',
      'Podpísať do piatku',
    ]);
    expect(detail.replySuggestions.map((suggestion) => suggestion.label)).toEqual([
      'Podpíšem',
      'Mám otázku',
      'Neskôr',
    ]);
    await socket.waitFor(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'ai.job.updated' &&
        message.event.data.job.kind === 'summary' &&
        message.event.data.job.status === 'done',
    );

    expect(await app.api.ok(api.threads.prepareAi, params, token)).toMatchObject({ pending: [] });
    expect(await claude.prompts()).toHaveLength(2);
    socket.close();
  });

  it('queues one job per kind when the thread is opened concurrently', async () => {
    const session = await registerUser(app.api, `ai-race-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    await app.api.ok(
      api.settings.update,
      { body: { ai: { location: 'local', features: { oneLiners: false } } } },
      token,
    );
    await addImapAccount(app.api, token, owner);
    const threads = await waitForInbox(app.api, token, (items) => items.length === 2);
    const contract = threads.find((thread) => thread.subject === 'Zmluva');
    expect(contract).toBeDefined();
    if (contract === undefined) {
      return;
    }
    const params = { params: { id: contract.id } };

    const states = await Promise.all(
      Array.from({ length: 4 }, () => app.api.ok(api.threads.prepareAi, params, token)),
    );

    expect(states.every((state) => state.pending.length === 2)).toBe(true);
    const claimed = await app.api.ok(api.ai.claimJobs, { body: { limit: 5 } }, token);
    expect(claimed.jobs.map((claim) => claim.job.kind).sort()).toEqual([
      'replySuggestions',
      'summary',
    ]);
    const explicit = await app.api.ok(
      api.ai.createJob,
      { body: { input: { kind: 'summary', threadId: contract.id } } },
      token,
    );
    expect(claimed.jobs.map((claim) => claim.job.id)).toContain(explicit.id);
    const [message] = claimed.jobs[0]?.thread?.messages ?? [];
    expect(claimed.jobs.map((claim) => claim.job.input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'summary', sourceMessageId: message?.id }),
      ]),
    );
  });

  it('refuses unknown threads', async () => {
    const session = await registerUser(app.api, `ai-open-${randomUUID().slice(0, 8)}@relay.test`);
    const failure = await app.api.fail(
      api.threads.prepareAi,
      { params: { id: 'thr_missing' } },
      session.accessToken,
    );
    expect(failure.status).toBe(404);
  });
});
