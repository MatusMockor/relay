import {
  type AccountId,
  AutomationActivityIdSchema,
  type AutomationId,
  supportedAutomations,
} from '@relay/shared';
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

  it('snoozes existing mail on apply, never forwards it and cancels the reminder on undo', async () => {
    const demo = client();
    const rules = supportedAutomations(await demo.listAutomations());

    await demo.replaceAutomations(
      rules.map((rule) =>
        rule.id === GITLAB
          ? {
              ...rule,
              actions: [
                { type: 'forward', to: 'uctovnicka@firma.sk' },
                { type: 'draftReply' },
                { type: 'remind', afterDays: 2 },
                { type: 'markRead' },
              ],
            }
          : rule,
      ),
    );

    await demo.applyAutomation(GITLAB);
    const snoozed = (await demo.getThread(demoIds.thread('o-pipeline'))).thread;
    const applied = (await demo.automationHistory(GITLAB)).entries.find(
      (entry) => entry.source === 'apply' && entry.undoneAt === null,
    );

    expect(snoozed).toMatchObject({
      state: 'reminder',
      remindAt: new Date(NOW.getTime() + 2 * 24 * 60 * 60_000).toISOString(),
    });
    expect(applied?.actions.map(({ action }) => action.type)).toEqual(['markRead', 'remind']);
    const undone = await demo.undoAutomationActivity(
      GITLAB,
      applied?.id ?? AutomationActivityIdSchema.parse('missing'),
    );

    expect(undone.results.map(({ action, outcome }) => [action.type, outcome])).toEqual([
      ['markRead', 'undone'],
      ['remind', 'undone'],
    ]);
    expect((await demo.getThread(demoIds.thread('o-pipeline'))).thread).toMatchObject({
      state: 'inbox',
      remindAt: null,
    });
  });

  it('leaves a reminder set again for the same time alone on undo', async () => {
    const demo = client();
    const rules = supportedAutomations(await demo.listAutomations());
    await demo.replaceAutomations(
      rules.map((rule) =>
        rule.id === GITLAB ? { ...rule, actions: [{ type: 'remind', afterDays: 2 }] } : rule,
      ),
    );
    await demo.applyAutomation(GITLAB);
    const threadId = demoIds.thread('o-pipeline');
    const { remindAt } = (await demo.getThread(threadId)).thread;
    const applied = (await demo.automationHistory(GITLAB)).entries.find(
      (entry) => entry.source === 'apply' && entry.undoneAt === null,
    );
    await demo.applyThreadAction(threadId, { type: 'cancelReminder' });
    await demo.applyThreadAction(threadId, { type: 'remind', at: remindAt ?? NOW.toISOString() });

    const undone = await demo.undoAutomationActivity(
      GITLAB,
      applied?.id ?? AutomationActivityIdSchema.parse('missing'),
    );

    expect(undone.results.map(({ outcome }) => outcome)).toEqual(['skipped']);
    expect((await demo.getThread(threadId)).thread).toMatchObject({ state: 'reminder', remindAt });
  });

  it('refuses a forward on a rule for all accounts or to its own address', async () => {
    const demo = client();
    const rules = supportedAutomations(await demo.listAutomations());
    const withForward = (accountId: AccountId | null, to: string) =>
      demo.replaceAutomations(
        rules.map((rule) =>
          rule.id === GITLAB ? { ...rule, accountId, actions: [{ type: 'forward', to }] } : rule,
        ),
      );

    await expect(withForward(null, 'uctovnicka@firma.sk')).rejects.toThrow(
      'Pravidlo pre všetky účty nemôže preposielať, vyber účet',
    );
    await expect(withForward(demoIds.account('efa'), 'meno@efabrica.sk')).rejects.toThrow(
      'nemôže preposielať na adresu vlastného účtu',
    );
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

describe('demo rule history move labels', () => {
  it('keeps a label the user added after the move', async () => {
    const demo = client();
    await demo.applyAutomation(GITLAB);
    const thread = demoIds.thread('o-pipeline');
    const label = await demo.createLabel({ accountId: demoIds.account('efa'), name: 'Dôležité' });
    await demo.applyThreadAction(thread, { type: 'addLabel', labelId: label.id });
    const { entries } = await demo.automationHistory(GITLAB);
    const applied = entries.find((entry) => entry.source === 'apply' && entry.undoneAt === null);

    const result = await demo.undoAutomationActivity(
      GITLAB,
      applied?.id ?? AutomationActivityIdSchema.parse('missing'),
    );

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['undone', 'undone']);
    expect((await demo.getThread(thread)).thread).toMatchObject({
      state: 'inbox',
      labelIds: [label.id],
    });
  });
});

async function mergedRun(demo: ReturnType<typeof client>) {
  const { entries } = await demo.automationHistory(GITLAB);
  const merged = entries.find((entry) => entry.threadId === demoIds.thread('o-mr-merged'));
  expect(merged).toBeDefined();
  return merged?.id ?? AutomationActivityIdSchema.parse('missing');
}
