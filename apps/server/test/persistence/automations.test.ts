import { ForbiddenError } from '@relay/engine';
import type { Automation, MessageId, UserId } from '@relay/shared/domain';
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
  match: 'all',
  conditions: [
    { type: 'fromDomain', domain: 'efabrica.sk' },
    { type: 'jiraEvent', kind: 'assigned' },
  ],
  exceptions: [],
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

  it('stores the match mode, exceptions and subject contains conditions', async () => {
    const seeded = await seedAccount(context.repositories);
    const rule = buildAutomation(seeded.user.id, {
      match: 'any',
      conditions: [
        { type: 'subjectContains', value: 'faktúra' },
        { type: 'fromDomain', domain: 'dodavatel.sk' },
      ],
      exceptions: [{ type: 'fromAddress', address: 'noreply@firma.sk' }],
    });

    await context.repositories.automations.replaceAll(seeded.user.id, [rule]);
    await context.repositories.automations.replaceAll(seeded.user.id, [
      { ...rule, match: 'all', exceptions: [{ type: 'hasAttachment' }] },
    ]);

    await expect(context.repositories.automations.listByUser(seeded.user.id)).resolves.toEqual([
      { ...rule, match: 'all', exceptions: [{ type: 'hasAttachment' }] },
    ]);
  });

  it('stores reminder, forward and AI reply draft actions', async () => {
    const seeded = await seedAccount(context.repositories);
    const rule = buildAutomation(seeded.user.id, {
      accountId: seeded.account.id,
      actions: [
        { type: 'draftReply' },
        { type: 'forward', to: 'uctovnicka@firma.sk' },
        { type: 'remind', afterDays: 7 },
      ],
    });

    await context.repositories.automations.replaceAll(seeded.user.id, [rule]);

    await expect(context.repositories.automations.listByUser(seeded.user.id)).resolves.toEqual([
      rule,
    ]);
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

  it('remembers a removed preset per user until it is restored', async () => {
    const { automations, users } = context.repositories;
    const user = await users.create(buildUser(), 'hash');
    const other = await users.create(buildUser(), 'hash');
    const preset = {
      ...buildAutomation(user.id, { name: 'Jira tasky' }),
      preset: 'jiraTasks' as const,
    };

    await automations.markPresetRemoved(user.id, 'jiraTasks');
    await automations.markPresetRemoved(user.id, 'jiraTasks');

    await expect(automations.isPresetRemoved(user.id, 'jiraTasks')).resolves.toBe(true);
    await expect(automations.isPresetRemoved(other.id, 'jiraTasks')).resolves.toBe(false);
    await automations.restorePreset(preset);
    await automations.restorePreset({ ...preset, id: newId('automation') });
    await expect(automations.isPresetRemoved(user.id, 'jiraTasks')).resolves.toBe(false);
    await expect(automations.listByUser(user.id)).resolves.toEqual([preset]);
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

  it('lists recent received mail of the account outside trash and spam', async () => {
    const seeded = await seedAccount(context.repositories);
    const { messages } = context.repositories;
    const archived = await seedThread(context.repositories, seeded, {
      subject: 'archived',
      lastMessageAt: at(30),
      state: 'done',
    });
    const inbox = await seedThread(
      context.repositories,
      seeded,
      { subject: 'inbox', lastMessageAt: at(40) },
      { date: at(5) },
    );
    await messages.upsert(
      buildMessage(inbox.thread, seeded.mailboxes.inbox, { subject: 'Re: inbox', date: at(40) }),
      new Map(),
    );
    await messages.upsert(
      buildMessage(inbox.thread, seeded.mailboxes.sent, { subject: 'Re: sent', date: at(35) }),
      new Map(),
    );
    await seedThread(context.repositories, seeded, { subject: 'old', lastMessageAt: at(5) });
    await seedThread(context.repositories, seeded, {
      subject: 'trash',
      lastMessageAt: at(50),
      state: 'trash',
    });

    const candidates = await context.repositories.automationCandidates.listRecent(
      seeded.account.id,
      { since: at(20), limit: 10 },
    );

    expect(candidates.map((candidate) => candidate.threadId)).toEqual([
      inbox.thread.id,
      archived.thread.id,
    ]);
    expect(candidates[0]?.messages.map((item) => item.subject.subject)).toEqual(['Re: inbox']);
    expect(candidates[1]?.lastMessageAt).toBe(at(30));
  });

  it('keeps only the newest messages of a long thread and finds messages by id', async () => {
    const seeded = await seedAccount(context.repositories);
    const long = await seedThread(
      context.repositories,
      seeded,
      { subject: 'long', lastMessageAt: at(200) },
      { date: at(0) },
    );
    const replies: MessageId[] = [];
    for (let index = 1; index <= 55; index += 1) {
      const reply = await context.repositories.messages.upsert(
        buildMessage(long.thread, seeded.mailboxes.inbox, {
          subject: `Re ${String(index)}`,
          date: at(index),
        }),
        new Map(),
      );
      replies.push(reply.id);
    }

    const [candidate] = await context.repositories.automationCandidates.listInbox(
      seeded.account.id,
      1,
    );
    const found = await context.repositories.automationCandidates.findMessages(seeded.user.id, [
      long.message.id,
      replies[54] ?? long.message.id,
    ]);

    expect(candidate?.messages).toHaveLength(50);
    expect(candidate?.messages[0]?.subject.subject).toBe('Re 6');
    expect(candidate?.messages.at(-1)?.subject.subject).toBe('Re 55');
    expect(found.map((message) => message.subject).sort()).toEqual(
      ['Re 55', long.message.subject].sort(),
    );
  });
});
