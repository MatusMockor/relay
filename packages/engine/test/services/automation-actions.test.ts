import type { AiOutput } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  addAutomations,
  automationInput,
  jobsOf,
  sync,
  syncedSetup,
  threadIdOf,
  TIBOR,
} from '../support/automations';
import { deliverMail } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const verdict = (output: Omit<Extract<AiOutput, { kind: 'automationTask' }>, 'kind'>) => [
  { type: 'completed' as const, output: { kind: 'automationTask' as const, ...output } },
];

describe('automation actions', () => {
  it('queues the thread summary on the runner and model of the rule', async () => {
    const setup = await syncedSetup();
    await addAutomations(setup.engine, [
      automationInput({
        actions: [{ type: 'summary' }],
        ai: { runner: 'codex', model: 'gpt-6-astra', effort: 'high', instructions: null },
      }),
    ]);
    setup.codex.respondWith(() => [
      {
        type: 'completed',
        output: { kind: 'summary', summary: 'Tibor chce ponuku.', checklist: [] },
      },
    ]);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Ponuka' });

    await sync(setup);
    const [job] = jobsOf(setup.engine, 'summary');
    expect(job).toMatchObject({
      runner: 'codex',
      model: 'gpt-6-astra',
      effort: 'high',
      status: 'queued',
    });
    await setup.engine.services.ai.processQueued();

    expect(setup.codex.requests.map((request) => [request.model, request.effort])).toEqual([
      ['gpt-6-astra', 'high'],
    ]);
    expect(
      setup.engine.claude.requests.filter((request) => request.input.kind === 'summary'),
    ).toEqual([]);
    const detail = await setup.engine.services.threads.getDetail(
      USER_ID,
      await threadIdOf(setup.engine, 'Ponuka'),
    );
    expect(detail.aiSummary).toBe('Tibor chce ponuku.');
  });

  it('creates a task written by AI when the mail is actionable', async () => {
    const setup = await syncedSetup();
    const saved = await addAutomations(setup.engine, [
      automationInput({
        actions: [{ type: 'task' }],
        ai: {
          runner: 'claude',
          model: 'claude-opus-5-5',
          effort: null,
          instructions: 'Task iba ak odo mňa niečo chce.',
        },
      }),
    ]);
    setup.engine.claude.respondWith((request) =>
      verdict({
        threadId: request.input.kind === 'automationTask' ? request.input.threadId : ('x' as never),
        actionable: true,
        title: 'Poslať Tiborovi ponuku',
        description: 'Tibor čaká ponuku do piatku.',
      }),
    );
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Ponuka' });

    await sync(setup);
    const [job] = jobsOf(setup.engine, 'automationTask');
    expect(job?.input).toMatchObject({
      kind: 'automationTask',
      automationId: saved.find((item) => item.name === 'Od Tibora')?.id,
      instructions: 'Task iba ak odo mňa niečo chce.',
      jiraKey: null,
    });
    await setup.engine.services.ai.processQueued();

    const tasks = await setup.engine.services.tasks.list(USER_ID, { limit: 10 });
    expect(tasks.items).toHaveLength(1);
    expect(tasks.items[0]).toMatchObject({
      title: 'Poslať Tiborovi ponuku',
      aiWhat: 'Tibor čaká ponuku do piatku.',
      threadId: await threadIdOf(setup.engine, 'Ponuka'),
      source: 'ai',
      state: 'open',
    });
    expect(
      setup.engine.claude.requests
        .filter((request) => request.input.kind === 'automationTask')
        .map((request) => request.model),
    ).toEqual(['claude-opus-5-5']);
  });

  it('falls back to the runner default for a stored model that left the catalog', async () => {
    const setup = await syncedSetup();
    await addAutomations(setup.engine, [automationInput({ actions: [{ type: 'summary' }] })]);
    const stored = await setup.engine.repositories.automations.listByUser(USER_ID);
    await setup.engine.repositories.automations.replaceAll(
      USER_ID,
      stored.map((item) =>
        item.preset === null
          ? { ...item, ai: { ...item.ai, model: 'claude-retired-1', effort: 'max' } }
          : item,
      ),
    );
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Starý model' });

    await sync(setup);

    const jobs = jobsOf(setup.engine, 'summary');
    expect(jobs.map((job) => [job.runner, job.model ?? null, job.effort ?? null])).toEqual([
      ['claude', null, null],
    ]);
  });

  it('creates no task when the AI finds nothing to do', async () => {
    const setup = await syncedSetup();
    await addAutomations(setup.engine, [automationInput({ actions: [{ type: 'task' }] })]);
    setup.engine.claude.respondWith((request) =>
      verdict({
        threadId: request.input.kind === 'automationTask' ? request.input.threadId : ('x' as never),
        actionable: false,
        title: '',
        description: '',
      }),
    );
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Len info' });

    await sync(setup);
    await setup.engine.services.ai.processQueued();

    expect(jobsOf(setup.engine, 'automationTask').map((job) => job.status)).toEqual(['done']);
    expect((await setup.engine.services.tasks.list(USER_ID, { limit: 10 })).items).toEqual([]);
  });

  it('notifies, marks read, pins and archives the new mail', async () => {
    const setup = await syncedSetup();
    await addAutomations(setup.engine, [
      automationInput({
        actions: [{ type: 'archive' }, { type: 'pin' }, { type: 'markRead' }, { type: 'notify' }],
      }),
    ]);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra' });

    await sync(setup);

    expect(setup.engine.events.ofType('automation.notified').map((event) => event.data)).toEqual([
      expect.objectContaining({
        automationName: 'Od Tibora',
        title: 'Tibor Hrasko',
        body: 'Faktúra',
      }),
    ]);
    const threadId = await threadIdOf(setup.engine, 'Faktúra');
    const thread = setup.engine.db.tables.threads.get(threadId);
    expect(thread).toMatchObject({ unread: false, state: 'done', markedDone: false });
    const [message] = [...setup.engine.db.tables.messages.values()].filter(
      (item) => item.threadId === threadId,
    );
    expect(message?.flags).toMatchObject({ seen: true, flagged: true });
    expect(
      [...setup.server.mailbox('Archive').messages.values()].map((item) => item.flags),
    ).toEqual([{ seen: true, flagged: true, answered: false }]);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
  });
});
