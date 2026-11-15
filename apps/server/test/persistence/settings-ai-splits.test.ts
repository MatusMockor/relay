import { ForbiddenError } from '@relay/engine';
import type { AiJob, Split, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, buildUser, defaultSettings, newId, seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('PgSettingsRepository', () => {
  const context = usePgTestContext();

  it('returns null until saved and then the latest settings', async () => {
    const user = await context.repositories.users.create(buildUser(), 'hash');
    await expect(context.repositories.settings.find(user.id)).resolves.toBeNull();
    const settings = defaultSettings();
    await context.repositories.settings.save(user.id, settings);
    const changed = { ...settings, density: 'compact' as const };
    await expect(context.repositories.settings.save(user.id, changed)).resolves.toEqual(changed);
    await expect(context.repositories.settings.find(user.id)).resolves.toEqual(changed);
  });
});

describe('PgSplitRepository', () => {
  const context = usePgTestContext();

  const buildSplit = (userId: UserId, overrides: Partial<Split> = {}): Split => ({
    id: newId('split'),
    userId,
    accountId: null,
    name: 'Jira',
    order: 0,
    rules: [{ type: 'subjectRegex', pattern: '^\\[JIRA\\]', caseSensitive: false }],
    exclusive: false,
    ...overrides,
  });

  it('replaces all splits in order and scopes them per account', async () => {
    const seeded = await seedAccount(context.repositories);
    const other = await seedAccount(context.repositories, seeded.user);
    const global = buildSplit(seeded.user.id, { order: 1 });
    const scoped = buildSplit(seeded.user.id, {
      name: 'Faktúry',
      accountId: seeded.account.id,
      order: 0,
    });

    await expect(
      context.repositories.splits.replaceAll(seeded.user.id, [global, scoped]),
    ).resolves.toEqual([scoped, global]);
    await expect(
      context.repositories.splits.listForAccount(seeded.user.id, other.account.id),
    ).resolves.toEqual([global]);
    await expect(
      context.repositories.splits.replaceAll(seeded.user.id, [{ ...global, order: 5 }]),
    ).resolves.toEqual([{ ...global, order: 5 }]);
  });

  it('rejects splits of another user', async () => {
    const owner = await context.repositories.users.create(buildUser(), 'hash');
    const other = await context.repositories.users.create(buildUser(), 'hash');
    await expect(
      context.repositories.splits.replaceAll(owner.id, [buildSplit(other.id)]),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('PgAiResultRepository and PgAiJobRepository', () => {
  const context = usePgTestContext();

  it('returns the latest result per thread and kind', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const base = {
      userId: seeded.user.id,
      threadId: thread.id,
      sourceMessageId: newId('message'),
      runner: 'claude' as const,
    };
    await context.repositories.aiResults.save({
      ...base,
      id: newId('aiResult'),
      output: { kind: 'oneLiner', text: 'Starý' },
      createdAt: at(1),
    });
    const latest = await context.repositories.aiResults.save({
      ...base,
      id: newId('aiResult'),
      output: { kind: 'oneLiner', text: 'Nový' },
      createdAt: at(2),
    });
    await context.repositories.aiResults.save({
      ...base,
      id: newId('aiResult'),
      output: { kind: 'summary', summary: 'Zhrnutie', checklist: [] },
      createdAt: at(3),
    });

    await expect(
      context.repositories.aiResults.findLatest(seeded.user.id, thread.id, 'oneLiner'),
    ).resolves.toEqual(latest);
    await expect(
      context.repositories.aiResults.findLatest(buildUser().id, thread.id, 'oneLiner'),
    ).resolves.toBeNull();
    await context.repositories.aiResults.deleteByThread(thread.id);
    await expect(
      context.repositories.aiResults.findLatest(seeded.user.id, thread.id, 'summary'),
    ).resolves.toBeNull();
  });

  it('creates and updates ai jobs', async () => {
    const user = await context.repositories.users.create(buildUser(), 'hash');
    const job: AiJob = {
      id: newId('aiJob'),
      userId: user.id,
      kind: 'chatAnswer',
      status: 'queued',
      runnerLocation: 'server',
      runner: 'codex',
      input: { kind: 'chatAnswer', question: 'Čo mám dnes urobiť?', threadId: null, history: [] },
      output: null,
      error: null,
      createdAt: at(0),
      updatedAt: at(0),
    };
    await expect(context.repositories.aiJobs.create(job)).resolves.toEqual(job);
    await expect(
      context.repositories.aiJobs.update(job.id, { status: 'running', updatedAt: at(1) }),
    ).resolves.toEqual({ ...job, status: 'running', updatedAt: at(1) });
    const done = await context.repositories.aiJobs.update(job.id, {
      status: 'done',
      output: { kind: 'chatAnswer', text: 'Odpovedz Eve.', references: [] },
      updatedAt: at(2),
    });
    expect(done).toMatchObject({
      status: 'done',
      output: { kind: 'chatAnswer', text: 'Odpovedz Eve.' },
      error: null,
    });
    await expect(context.repositories.aiJobs.findById(buildUser().id, job.id)).resolves.toBeNull();
    await expect(context.repositories.aiJobs.findById(user.id, job.id)).resolves.toEqual(done);
  });
});
