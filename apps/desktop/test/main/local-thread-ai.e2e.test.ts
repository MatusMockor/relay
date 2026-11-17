import { CliDetector, CliLocator, createCliRunnerRegistry } from '@relay/ai';
import { AiJobIdSchema, ThreadIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, deliverMail, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { installStubClaude, type StubClaude } from './support/stub-claude';
import { createTempDir, type TempDir } from './support/temp-dir';

describe('local thread AI on open and on demand', () => {
  let dir: TempDir;
  let claude: StubClaude;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    claude = await installStubClaude();
    mailbox = await createGreenMailAccount();
    await deliverMail(mailbox, {
      from: 'Jana <jana@example.com>',
      subject: 'Faktúra za október',
      text: 'Posielam faktúru.',
    });
    await deliverMail(mailbox, {
      from: 'Jira <jira@acme.atlassian.net>',
      subject: '[JIRA] (CMS-217) Editor stráca obrázky',
      text: 'Jana Kováčová assigned CMS-217 to you\n\nhttps://acme.atlassian.net/browse/CMS-217',
    });
    const detector = new CliDetector({
      locator: new CliLocator({ pathEnv: claude.dir, extraDirs: [] }),
    });
    harness = startLocalRuntime(dir, {
      aiRunners: createCliRunnerRegistry({ location: 'local', detector }),
    });
    await harness.runtime.start();
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await claude.dispose();
    await dir.remove();
  });

  it('queues reply suggestions on open, the summary on request, and returns both results', async () => {
    const { bridge } = harness;
    expect(
      (await bridge.invoke('local.settings.update', { ai: { features: { oneLiners: false } } })).ok,
    ).toBe(true);
    expect((await bridge.invoke('local.accounts.create', imapAccountBody(mailbox))).ok).toBe(true);
    expect((await bridge.invoke('local.sync.now', {})).ok).toBe(true);
    const page = await bridge.invoke('local.threads.list', { view: 'inbox' });
    const threads = page.ok ? page.data.items : [];
    const jira = threads.find((thread) => thread.jiraKey === 'CMS-217');
    expect(jira?.jiraActor).toBe('Jana Kováčová');
    const threadId =
      threads.find((thread) => thread.subject === 'Faktúra za október')?.id ??
      ThreadIdSchema.parse('missing');

    const first = await bridge.invoke('local.threads.prepareAi', { threadId });
    expect(first.ok && first.data.pending).toEqual(['replySuggestions']);
    const again = await bridge.invoke('local.threads.prepareAi', { threadId });
    expect(again.ok && again.data.jobs).toEqual(first.ok ? first.data.jobs : null);
    const requested = await bridge.invoke('local.threads.requestSummary', { threadId });
    expect(requested.ok && requested.data.pending).toEqual(['summary']);
    const summaryJob = requested.ok
      ? requested.data.jobs.find((ref) => ref.kind === 'summary')
      : undefined;
    expect(summaryJob).toBeDefined();

    await harness.runtime.engine.services.ai.processQueued();

    const settled = await bridge.invoke('local.ai.getJob', {
      jobId: summaryJob?.jobId ?? AiJobIdSchema.parse('missing'),
    });
    expect(settled.ok && settled.data.status).toBe('done');

    const detail = await bridge.invoke('local.threads.get', { threadId });
    expect(detail.ok && detail.data.aiSummary).toBe('Jana posiela faktúru za október.');
    expect(detail.ok && detail.data.checklist.map((item) => item.text)).toEqual([
      'Skontrolovať faktúru',
    ]);
    expect(detail.ok && detail.data.replySuggestions.map((item) => item.label)).toEqual([
      'Zaplatím',
      'Mám otázku',
      'Neskôr',
    ]);
    expect(
      harness.events.filter(
        (event) => event.type === 'ai.job.updated' && event.data.job.status === 'done',
      ),
    ).toHaveLength(2);
    const done = await bridge.invoke('local.threads.prepareAi', { threadId });
    expect(done.ok && done.data.pending).toEqual([]);
    const summarized = await bridge.invoke('local.threads.requestSummary', { threadId });
    expect(summarized.ok && summarized.data.pending).toEqual([]);
    expect(await claude.calls()).toHaveLength(2);
  });
});
