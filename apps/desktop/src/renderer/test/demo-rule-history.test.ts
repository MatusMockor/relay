import { AutomationActivityIdSchema, type AutomationId } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { automationId } from '../src/data/demo/seed/automations';
import { demoIds } from '../src/data/demo/seed/ids';

const NOW = new Date(2026, 10, 19, 9, 41);
const GITLAB: AutomationId = automationId('gitlab');

const client = () => createDemoMailClient({ now: () => NOW, aiStepMs: 0 });

describe('demo rule history', () => {
  it('records an apply-to-existing run and undoes it back into the inbox', async () => {
    const demo = client();
    await demo.applyAutomation(GITLAB);
    const moved = await demo.getThread(demoIds.thread('o-pipeline'));
    const { entries, stats } = await demo.automationHistory(GITLAB);
    const applied = entries.find((entry) => entry.source === 'apply' && entry.undoneAt === null);

    expect(moved.thread).toMatchObject({ state: 'done', labelIds: [demoIds.label('efa')] });
    expect(stats.runs).toBe(4);
    expect(applied?.actions.map(({ action, outcome }) => [action.type, outcome])).toEqual([
      ['addLabel', 'ok'],
      ['moveTo', 'ok'],
    ]);
    const undone = await demo.undoAutomationActivity(
      GITLAB,
      applied?.id ?? AutomationActivityIdSchema.parse('missing'),
    );

    expect(undone.results.map(({ action, outcome }) => [action.type, outcome])).toEqual([
      ['addLabel', 'undone'],
      ['moveTo', 'undone'],
    ]);
    expect(undone.entry.undoneAt).toBe(NOW.toISOString());
    expect((await demo.getThread(demoIds.thread('o-pipeline'))).thread).toMatchObject({
      state: 'inbox',
      labelIds: [],
    });
    await expect(demo.undoAutomationActivity(GITLAB, undone.entry.id)).resolves.toMatchObject({
      alreadyUndone: true,
      results: [],
    });
  });

  it('reports AI actions as not undoable and keeps the run open', async () => {
    const demo = client();
    const mentions = automationId('mentions');
    const [entry] = (await demo.automationHistory(mentions)).entries;

    const result = await demo.undoAutomationActivity(
      mentions,
      entry?.id ?? AutomationActivityIdSchema.parse('missing'),
    );

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['notUndoable', 'notUndoable']);
    expect(result.entry.undoneAt).toBeNull();
  });

  it('refuses a run of another rule and an unknown rule', async () => {
    const demo = client();
    const [entry] = (await demo.automationHistory(automationId('mentions'))).entries;
    const id = entry?.id ?? AutomationActivityIdSchema.parse('missing');

    await expect(demo.undoAutomationActivity(GITLAB, id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(demo.automationHistory(automationId('nope'))).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('undoes only the runs since the given time', async () => {
    const demo = client();
    const midnight = new Date(NOW);
    midnight.setHours(0, 0, 0, 0);

    await expect(demo.undoAutomationSince(GITLAB, midnight.toISOString())).resolves.toEqual({
      entries: 1,
      undone: 1,
      failed: 0,
    });
    await expect(demo.undoAutomationSince(GITLAB, midnight.toISOString())).resolves.toEqual({
      entries: 0,
      undone: 0,
      failed: 0,
    });
    expect((await demo.getThread(demoIds.thread('o-mr-merged'))).thread).toMatchObject({
      state: 'inbox',
      unread: true,
    });
  });

  it('skips the reversals of a thread the user moved to the trash', async () => {
    const demo = client();
    const merged = await mergedRun(demo);
    await demo.applyThreadAction(demoIds.thread('o-mr-merged'), { type: 'trash' });

    const result = await demo.undoAutomationActivity(GITLAB, merged);

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['skipped', 'skipped']);
    expect((await demo.getThread(demoIds.thread('o-mr-merged'))).thread).toMatchObject({
      state: 'trash',
      unread: false,
    });
  });

  it('skips an archive the user later filed into a folder', async () => {
    const demo = client();
    const merged = await mergedRun(demo);
    await demo.applyThreadAction(demoIds.thread('o-mr-merged'), {
      type: 'move',
      mailboxId: demoIds.folder('efa', 'projekty'),
    });

    const result = await demo.undoAutomationActivity(GITLAB, merged);

    expect(result.results.map(({ action, outcome }) => [action.type, outcome])).toEqual([
      ['markRead', 'undone'],
      ['archive', 'skipped'],
    ]);
  });

  it('skips a move the user already reversed and then archived', async () => {
    const demo = client();
    await demo.applyAutomation(GITLAB);
    const thread = demoIds.thread('o-pipeline');
    await demo.applyThreadAction(thread, { type: 'undoMove' });
    await demo.applyThreadAction(thread, { type: 'archive' });
    const { entries } = await demo.automationHistory(GITLAB);
    const applied = entries.find((entry) => entry.source === 'apply' && entry.undoneAt === null);

    const result = await demo.undoAutomationActivity(
      GITLAB,
      applied?.id ?? AutomationActivityIdSchema.parse('missing'),
    );

    expect(result.results.map(({ action, outcome }) => [action.type, outcome])).toEqual([
      ['addLabel', 'undone'],
      ['moveTo', 'skipped'],
    ]);
    expect((await demo.getThread(thread)).thread.state).toBe('done');
  });
});

describe('demo rule history move origins', () => {
  it('skips a move whose origin a later move replaced', async () => {
    const demo = client();
    await demo.applyAutomation(GITLAB);
    const thread = demoIds.thread('o-pipeline');
    const projekty = demoIds.folder('efa', 'projekty');
    await demo.applyThreadAction(thread, { type: 'move', mailboxId: demoIds.mailbox('efa') });
    await demo.applyThreadAction(thread, { type: 'move', mailboxId: projekty });
    const { entries } = await demo.automationHistory(GITLAB);
    const applied = entries.find((entry) => entry.source === 'apply' && entry.undoneAt === null);

    const result = await demo.undoAutomationActivity(
      GITLAB,
      applied?.id ?? AutomationActivityIdSchema.parse('missing'),
    );

    expect(result.results.map(({ action, outcome }) => [action.type, outcome])).toEqual([
      ['addLabel', 'undone'],
      ['moveTo', 'skipped'],
    ]);
    expect((await demo.getThread(thread)).messages.map(({ mailboxId }) => mailboxId)).toContain(
      projekty,
    );
  });
});

async function mergedRun(demo: ReturnType<typeof client>) {
  const { entries } = await demo.automationHistory(GITLAB);
  const merged = entries.find((entry) => entry.threadId === demoIds.thread('o-mr-merged'));
  expect(merged).toBeDefined();
  return merged?.id ?? AutomationActivityIdSchema.parse('missing');
}
