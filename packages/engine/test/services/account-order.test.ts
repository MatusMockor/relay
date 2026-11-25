import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src';
import { seedAccount, standardServer } from '../support/fixtures';
import { createTestEngine, OTHER_USER_ID, type TestEngine, USER_ID } from '../support/test-engine';

const seedThree = async (engine: TestEngine) => {
  const work = await seedAccount(engine, {
    email: 'alice@work.test',
    displayName: 'Práca',
    createdAt: '2026-11-01T08:00:00.000Z',
  });
  const home = await seedAccount(engine, {
    email: 'alice@home.test',
    displayName: 'Domov',
    isPrimary: false,
    createdAt: '2026-11-02T08:00:00.000Z',
  });
  const club = await seedAccount(engine, {
    email: 'alice@club.test',
    displayName: 'Klub',
    isPrimary: false,
    createdAt: '2026-11-03T08:00:00.000Z',
  });
  return { work: work.account, home: home.account, club: club.account };
};

const listedIds = async (engine: TestEngine): Promise<AccountId[]> =>
  (await engine.services.accounts.list(USER_ID)).map((account) => account.id);

describe('AccountOrderService', () => {
  it('stores the chosen order and announces it once without touching the accounts', async () => {
    const engine = createTestEngine();
    const { work, home, club } = await seedThree(engine);
    engine.events.clear();

    const reordered = await engine.services.accountOrder.reorder(USER_ID, [
      club.id,
      work.id,
      home.id,
    ]);

    expect(reordered.map((account) => account.id)).toEqual([club.id, work.id, home.id]);
    expect(await listedIds(engine)).toEqual([club.id, work.id, home.id]);
    expect(engine.events.published.map((entry) => entry.event.type)).toEqual([
      'accounts.reordered',
    ]);
    expect(engine.events.ofType('accounts.reordered')[0]?.data.accountIds).toEqual([
      club.id,
      work.id,
      home.id,
    ]);
    expect(reordered.find((account) => account.id === work.id)?.isPrimary).toBe(true);
  });

  it('announces every successful reorder, even one that keeps the order', async () => {
    const engine = createTestEngine();
    const { work, home, club } = await seedThree(engine);
    engine.events.clear();

    await engine.services.accountOrder.reorder(USER_ID, [work.id, home.id, club.id]);

    expect(
      engine.events.ofType('accounts.reordered').map((event) => event.data.accountIds),
    ).toEqual([[work.id, home.id, club.id]]);
  });

  it('rejects an order that leaves an account out', async () => {
    const engine = createTestEngine();
    const { work, home, club } = await seedThree(engine);

    engine.events.clear();

    await expect(
      engine.services.accountOrder.reorder(USER_ID, [club.id, work.id]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await listedIds(engine)).toEqual([work.id, home.id, club.id]);
    expect(engine.events.published).toEqual([]);
  });

  it('rejects an account of another user', async () => {
    const engine = createTestEngine();
    const { work, home, club } = await seedThree(engine);
    const stranger = await seedAccount(engine, {
      userId: OTHER_USER_ID,
      email: 'bob@example.com',
    });

    await expect(
      engine.services.accountOrder.reorder(USER_ID, [
        club.id,
        work.id,
        home.id,
        stranger.account.id,
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      engine.services.accountOrder.reorder(USER_ID, [club.id, work.id, stranger.account.id]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await listedIds(engine)).toEqual([work.id, home.id, club.id]);
    expect(
      (await engine.services.accounts.list(OTHER_USER_ID)).map((account) => account.id),
    ).toEqual([stranger.account.id]);
  });

  it('rejects an account listed twice', async () => {
    const engine = createTestEngine();
    const { work, home, club } = await seedThree(engine);

    await expect(
      engine.services.accountOrder.reorder(USER_ID, [club.id, work.id, home.id, club.id]),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      engine.services.accountOrder.reorder(USER_ID, [club.id, club.id, home.id]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await listedIds(engine)).toEqual([work.id, home.id, club.id]);
  });

  it('adds a new account after the reordered ones', async () => {
    const engine = createTestEngine();
    const { work, home, club } = await seedThree(engine);
    await engine.services.accountOrder.reorder(USER_ID, [home.id, club.id, work.id]);
    engine.providers.register('alice@new.test', standardServer());

    const added = await engine.services.accounts.create(USER_ID, {
      provider: 'imap',
      email: 'alice@new.test',
      password: 'secret',
      settings: {
        imap: { host: 'imap.example.com', port: 993, secure: true },
        smtp: { host: 'smtp.example.com', port: 465, secure: true },
        username: 'alice@new.test',
      },
    });

    expect(await listedIds(engine)).toEqual([home.id, club.id, work.id, added.id]);
  });

  it('keeps the order after another account is removed', async () => {
    const engine = createTestEngine();
    const { work, home, club } = await seedThree(engine);
    await engine.services.accountOrder.reorder(USER_ID, [club.id, home.id, work.id]);

    await engine.services.accounts.remove(USER_ID, home.id);

    expect(await listedIds(engine)).toEqual([club.id, work.id]);
    await engine.services.accountOrder.reorder(USER_ID, [work.id, club.id]);
    expect(await listedIds(engine)).toEqual([work.id, club.id]);
  });

  it('promotes the oldest remaining account when the primary one is removed', async () => {
    const engine = createTestEngine();
    const { work, home, club } = await seedThree(engine);
    await engine.services.accountOrder.reorder(USER_ID, [club.id, work.id, home.id]);

    await engine.services.accounts.remove(USER_ID, work.id);

    const remaining = await engine.services.accounts.list(USER_ID);
    expect(remaining.map((account) => account.id)).toEqual([club.id, home.id]);
    expect(remaining.filter((account) => account.isPrimary).map((account) => account.id)).toEqual([
      home.id,
    ]);
  });

  it('takes the default sender name from the oldest named account, whatever the order', async () => {
    const engine = createTestEngine();
    const { work, home, club } = await seedThree(engine);
    await engine.repositories.accounts.update(USER_ID, work.id, { senderName: null });
    await engine.repositories.accounts.update(USER_ID, home.id, { senderName: 'Alica Domov' });
    await engine.repositories.accounts.update(USER_ID, club.id, { senderName: 'Alica Klub' });
    await engine.services.accountOrder.reorder(USER_ID, [club.id, home.id, work.id]);
    engine.providers.register('alice@new.test', standardServer());

    const added = await engine.services.accounts.create(USER_ID, {
      provider: 'imap',
      email: 'alice@new.test',
      password: 'secret',
      settings: {
        imap: { host: 'imap.example.com', port: 993, secure: true },
        smtp: { host: 'smtp.example.com', port: 465, secure: true },
        username: 'alice@new.test',
      },
    });

    expect(added.senderName).toBe('Alica Domov');
  });
});
