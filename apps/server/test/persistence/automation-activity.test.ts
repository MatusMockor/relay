import type { AutomationActivityRecord } from '@relay/engine';
import type { Automation, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, buildUser, newId, seedAccount, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const RETENTION = { olderThan: at(0), keep: 3 };

const ruleOf = (seeded: SeededAccount): Automation => ({
  id: newId('automation'),
  userId: seeded.user.id,
  accountId: seeded.account.id,
  name: 'Faktúry',
  enabled: true,
  order: 1,
  preset: null,
  match: 'all',
  conditions: [{ type: 'fromDomain', domain: 'efabrica.sk' }],
  exceptions: [],
  ai: { runner: 'claude', model: null, effort: null, instructions: null },
  actions: [{ type: 'archive' }],
});

const recordOf = (
  seeded: SeededAccount,
  automation: Automation,
  createdAt: string,
): AutomationActivityRecord => ({
  id: newId('automationActivity'),
  userId: seeded.user.id,
  automationId: automation.id,
  accountId: seeded.account.id,
  threadId: newId('thread'),
  messageId: newId('message'),
  source: 'apply',
  from: { name: 'Tibor', email: 'tibor@efabrica.sk' },
  subject: 'Faktúra',
  actions: [
    { action: { type: 'archive' }, outcome: 'ok' },
    { action: { type: 'markRead' }, outcome: 'failed' },
  ],
  createdAt,
  undoneAt: null,
});

const withoutUser = ({ userId: _userId, ...activity }: AutomationActivityRecord) => activity;

describe('PgAutomationActivityRepository', () => {
  const context = usePgTestContext();

  const seed = async () => {
    const seeded = await seedAccount(context.repositories);
    const automation = ruleOf(seeded);
    await context.repositories.automations.replaceAll(seeded.user.id, [automation]);
    return { seeded, automation, activity: context.repositories.automationActivity };
  };

  it('round-trips entries newest first with stats since a time', async () => {
    const { seeded, automation, activity } = await seed();
    const first = recordOf(seeded, automation, at(10));
    const second = { ...recordOf(seeded, automation, at(20)), from: null };
    await activity.append(first, RETENTION);
    await activity.append(second, RETENTION);

    await expect(activity.listRecent(seeded.user.id, automation.id, 10)).resolves.toEqual([
      withoutUser(second),
      withoutUser(first),
    ]);
    await expect(activity.stats(seeded.user.id, automation.id, at(15))).resolves.toEqual({
      runs: 1,
      failedActions: 1,
    });
    await expect(activity.stats(seeded.user.id, automation.id, at(30))).resolves.toEqual({
      runs: 0,
      failedActions: 0,
    });
  });

  it('marks an entry undone once and lists open entries since a time', async () => {
    const { seeded, automation, activity } = await seed();
    const older = recordOf(seeded, automation, at(10));
    const open = recordOf(seeded, automation, at(20));
    const undone = recordOf(seeded, automation, at(30));
    for (const record of [older, open, undone]) {
      await activity.append(record, RETENTION);
    }

    await expect(activity.markUndone(seeded.user.id, undone.id, at(40))).resolves.toBe(true);
    await expect(activity.markUndone(seeded.user.id, undone.id, at(50))).resolves.toBe(false);

    await expect(activity.findById(seeded.user.id, undone.id)).resolves.toMatchObject({
      undoneAt: at(40),
    });
    const listed = await activity.listOpenSince(seeded.user.id, automation.id, at(15));
    expect(listed.map((entry) => entry.id)).toEqual([open.id]);
  });

  it('keeps entries private to their user', async () => {
    const { seeded, automation, activity } = await seed();
    const record = recordOf(seeded, automation, at(10));
    await activity.append(record, RETENTION);
    const other: UserId = (await context.repositories.users.create(buildUser(), 'hash')).id;

    await expect(activity.findById(other, record.id)).resolves.toBeNull();
    await expect(activity.listRecent(other, automation.id, 10)).resolves.toEqual([]);
    await expect(activity.markUndone(other, record.id, at(20))).resolves.toBe(false);
  });

  it('prunes entries past the retention age and beyond the per rule cap', async () => {
    const { seeded, automation, activity } = await seed();
    await activity.append(recordOf(seeded, automation, at(-10)), RETENTION);
    const recent = [10, 20, 30, 40].map((minutes) => recordOf(seeded, automation, at(minutes)));
    for (const record of recent) {
      await activity.append(record, RETENTION);
    }

    const listed = await activity.listRecent(seeded.user.id, automation.id, 10);
    expect(listed.map((entry) => entry.id)).toEqual(
      [...recent]
        .reverse()
        .slice(0, 3)
        .map((record) => record.id),
    );
  });

  it('drops the history of a removed rule', async () => {
    const { seeded, automation, activity } = await seed();
    const record = recordOf(seeded, automation, at(10));
    await activity.append(record, RETENTION);

    await context.repositories.automations.replaceAll(seeded.user.id, []);

    await expect(activity.findById(seeded.user.id, record.id)).resolves.toBeNull();
  });
});
