import { ForbiddenError } from '@relay/engine';
import type { Automation, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, buildMessage, buildUser, newId, seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const buildAutomation = (userId: UserId, overrides: Partial<Automation> = {}): Automation => ({
  id: newId('automation'),
  userId,
  accountId: null,
  name: 'Od Tibora',
  enabled: true,
  order: 1,
  preset: null,
  conditions: [
    { type: 'fromDomain', domain: 'efabrica.sk' },
    { type: 'jiraEvent', kind: 'assigned' },
  ],
  ai: { runner: 'codex', model: 'gpt-6-astra', effort: 'high', instructions: 'Iba úlohy.' },
  actions: [{ type: 'task' }, { type: 'pin' }],
  ...overrides,
});

describe('PgAutomationRepository', () => {
  const context = usePgTestContext();

  it('replaces all automations of a user in order', async () => {
    const seeded = await seedAccount(context.repositories);
    const other = await context.repositories.users.create(buildUser(), 'hash');
    const foreign = buildAutomation(other.id);
    await context.repositories.automations.replaceAll(other.id, [foreign]);
    const scoped = buildAutomation(seeded.user.id, { accountId: seeded.account.id, order: 2 });
    const first = buildAutomation(seeded.user.id, { name: 'Prvé', order: 0 });

    await expect(
      context.repositories.automations.replaceAll(seeded.user.id, [scoped, first]),
    ).resolves.toEqual([first, scoped]);
    await expect(
      context.repositories.automations.replaceAll(seeded.user.id, [{ ...first, enabled: false }]),
    ).resolves.toEqual([{ ...first, enabled: false }]);
    await expect(context.repositories.automations.listByUser(other.id)).resolves.toEqual([foreign]);
  });

  it('rejects automations of another user and foreign accounts', async () => {
    const owner = await seedAccount(context.repositories);
    const other = await seedAccount(context.repositories);

    await expect(
      context.repositories.automations.replaceAll(owner.user.id, [buildAutomation(other.user.id)]),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      context.repositories.automations.replaceAll(owner.user.id, [
        buildAutomation(owner.user.id, { accountId: other.account.id }),
      ]),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('creates the preset only once per user', async () => {
    const user = await context.repositories.users.create(buildUser(), 'hash');
    const preset = buildAutomation(user.id, { preset: 'jiraTasks', name: 'Jira tasky' });

    await context.repositories.automations.createPresetIfAbsent(preset);
    await context.repositories.automations.createPresetIfAbsent({
      ...preset,
      id: newId('automation'),
    });

    await expect(context.repositories.automations.listByUser(user.id)).resolves.toEqual([preset]);
  });
});

describe('PgAutomationRunRepository', () => {
  const context = usePgTestContext();

  it('claims a run once per automation and message', async () => {
    const seeded = await seedAccount(context.repositories);
    const { message } = await seedThread(context.repositories, seeded);
    const automation = buildAutomation(seeded.user.id);
    await context.repositories.automations.replaceAll(seeded.user.id, [automation]);
    const run = {
      userId: seeded.user.id,
      automationId: automation.id,
      messageId: message.id,
      createdAt: at(1),
    };

    await expect(context.repositories.automationRuns.claim(run)).resolves.toBe(true);
    await expect(context.repositories.automationRuns.claim(run)).resolves.toBe(false);
    await context.repositories.automationRuns.release(automation.id, [message.id]);
    await expect(context.repositories.automationRuns.claim(run)).resolves.toBe(true);
  });
});

describe('PgAutomationCandidateRepository', () => {
  const context = usePgTestContext();

  it('lists the newest inbox threads of the account with their match subjects', async () => {
    const seeded = await seedAccount(context.repositories);
    await seedThread(context.repositories, seeded, { subject: 'old', lastMessageAt: at(1) });
    const newest = await seedThread(
      context.repositories,
      seeded,
      { subject: 'new', lastMessageAt: at(3), jiraKey: 'EF-1' },
      { date: at(2) },
    );
    await seedThread(context.repositories, seeded, { subject: 'mid', lastMessageAt: at(2) });
    await seedThread(context.repositories, seeded, {
      subject: 'done',
      lastMessageAt: at(4),
      state: 'done',
    });
    await context.repositories.messages.upsert(
      buildMessage(newest.thread, seeded.mailboxes.inbox, { subject: 'Re: new', date: at(3) }),
      new Map(),
    );

    const candidates = await context.repositories.automationCandidates.listInbox(
      seeded.account.id,
      2,
    );

    expect(candidates.map((candidate) => [candidate.threadId, candidate.jiraKey])).toEqual([
      [newest.thread.id, 'EF-1'],
      [expect.any(String), null],
    ]);
    expect(candidates[0]?.lastMessageAt).toBe(at(3));
    expect(candidates[0]?.messages.map((item) => item.subject.subject)).toEqual([
      newest.message.subject,
      'Re: new',
    ]);
  });
});
