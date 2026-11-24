import { CliDetector, CliLocator, createCliRunnerRegistry } from '@relay/ai';
import {
  AccountIdSchema,
  LabelIdSchema,
  type ThreadId,
  ThreadIdSchema,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, deliverMail, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { runAi } from './support/run-ai';
import { imapAccountBody } from './support/seed-account';
import { installStubClaude, type StubClaude } from './support/stub-claude';
import { createTempDir, type TempDir } from './support/temp-dir';

describe('local AI results over IPC', () => {
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

  const syncedThread = async (): Promise<ThreadId> => {
    const { bridge } = harness;
    expect((await bridge.invoke('local.accounts.create', imapAccountBody(mailbox))).ok).toBe(true);
    expect((await bridge.invoke('local.sync.now', {})).ok).toBe(true);
    const page = await bridge.invoke('local.threads.list', { view: 'inbox' });
    const thread = page.ok ? page.data.items[0] : undefined;
    expect(thread?.subject).toBe('Faktúra za október');
    return thread?.id ?? ThreadIdSchema.parse('missing');
  };

  it('stores checklist ticks of a local summary', async () => {
    const { bridge } = harness;
    const threadId = await syncedThread();
    const summary = await runAi(bridge, { input: { kind: 'summary', threadId }, runner: 'claude' });
    expect(summary.error).toBeNull();
    const before = await bridge.invoke('local.threads.get', { threadId });
    const item = before.ok ? before.data.checklist[0] : undefined;
    expect(item).toMatchObject({ text: 'Skontrolovať faktúru', done: false });
    const ticked = await bridge.invoke('local.threads.updateChecklist', {
      threadId,
      item: { itemId: item?.id ?? 'missing', done: true },
    });
    expect(ticked.ok && ticked.data.checklist[0]?.done).toBe(true);
    const after = await bridge.invoke('local.threads.get', { threadId });
    expect(after.ok && after.data.checklist[0]?.done).toBe(true);
    const unknown = await bridge.invoke('local.threads.updateChecklist', {
      threadId,
      item: { itemId: 'nope', done: true },
    });
    expect(unknown.ok ? null : unknown.error.code).toBe('not_found');
  });

  it('creates a task from a thread with a local createTask run', async () => {
    const { bridge } = harness;
    const threadId = await syncedThread();
    const run = await runAi(bridge, {
      input: { kind: 'createTask', threadId, hint: 'do piatka' },
      runner: 'claude',
    });
    expect(run.error).toBeNull();
    expect(run.events.at(-1)).toEqual({
      type: 'completed',
      output: {
        kind: 'createTask',
        threadId,
        title: 'Skontrolovať faktúru',
        aiWhat: 'Skontrolovať faktúru za október do piatka.',
        priority: 'high',
      },
    });
    const tasks = await bridge.invoke('local.tasks.list', {});
    expect(tasks.ok && tasks.data.items).toEqual([
      expect.objectContaining({
        title: 'Skontrolovať faktúru',
        source: 'ai',
        priority: 'high',
        threadId,
      }),
    ]);
    expect(harness.events.some((event) => event.type === 'task.upserted')).toBe(true);
    const [call] = await claude.calls();
    expect(call?.stdin).toContain('do piatka');
  });

  it('passes the chosen model and effort of a local run to the CLI', async () => {
    const { bridge } = harness;
    const threadId = await syncedThread();
    const run = await runAi(bridge, {
      input: { kind: 'summary', threadId },
      runner: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
    });
    expect(run.error).toBeNull();
    expect(run.events.at(-1)).toMatchObject({
      type: 'completed',
      output: { kind: 'summary' },
    });
    const [call] = await claude.calls();
    const args = call?.args ?? [];
    const model = args.indexOf('--model');
    const effort = args.indexOf('--effort');
    expect(model).toBeGreaterThanOrEqual(0);
    expect(effort).toBeGreaterThanOrEqual(0);
    expect(args[model + 1]).toBe('claude-sonnet-5-5');
    expect(args[effort + 1]).toBe('high');
  });

  it('suggests a rule from a sentence with a local run and resolves the label', async () => {
    const accountId = AccountIdSchema.parse('acc_freelance');
    const run = await runAi(harness.bridge, {
      input: {
        kind: 'ruleSuggest',
        sentence: 'faktúry od dodávateľov s prílohou daj do štítku Faktúry a archivuj',
        accountId: null,
        accounts: [
          {
            id: accountId,
            name: 'Freelance',
            labels: [{ id: LabelIdSchema.parse('lbl_invoices'), name: 'Faktúry' }],
            folders: [],
          },
        ],
      },
      runner: 'claude',
    });

    expect(run.error).toBeNull();
    expect(run.events.at(-1)).toEqual({
      type: 'completed',
      output: {
        kind: 'ruleSuggest',
        suggestion: {
          name: 'Faktúry',
          accountId,
          match: 'all',
          conditions: [{ type: 'hasAttachment' }],
          exceptions: [],
          actions: [{ type: 'addLabel', labelId: 'lbl_invoices' }, { type: 'archive' }],
          understood: 'Maily s prílohou dostanú štítok Faktúry a archivujú sa.',
          unmapped: ['od dodávateľov'],
        },
      },
    });
    const [call] = await claude.calls();
    expect(call?.stdin).toContain('faktúry od dodávateľov');
    expect(call?.mcpConfig).toBeNull();
    const automations = await harness.bridge.invoke('local.automations.list');
    expect(automations.ok && automations.data.map((rule) => rule.name)).not.toContain('Faktúry');
  });

  it('rejects a rule suggestion with an empty sentence before it reaches the CLI', async () => {
    const run = await runAi(harness.bridge, {
      input: { kind: 'ruleSuggest', sentence: ' ', accountId: null, accounts: [] },
    });

    expect(run.error?.code).toBe('validation_failed');
    expect(await claude.calls()).toEqual([]);
  });
});
