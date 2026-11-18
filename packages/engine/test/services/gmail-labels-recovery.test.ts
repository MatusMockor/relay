import { describe, expect, it } from 'vitest';
import { deliverMail, ME, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';
const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

const gmailAccount = (engine: TestEngine) =>
  seedAccount(engine, { settings: GMAIL_SETTINGS }, { gmail: true });

const labelNames = async (engine: TestEngine): Promise<string[]> =>
  (await engine.repositories.labels.list(USER_ID, null)).map((label) => label.name).sort();

describe('Gmail label catalog recovery', () => {
  it('keeps a pending label rescan when the sync fails after the catalog was saved', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    const uid = deliverMail(server, 'Archive', {
      id: 'g1',
      labels: [],
      emailId: 'gm-1',
      date: DATE,
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    server.addMailbox('Faktúry', 'label', 503);
    server.record('Archive', uid).labels = ['Faktúry'];
    server.afterNextList = () => {
      server.failOperations = 'Connection reset';
      return Promise.resolve();
    };

    const failed = await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(failed.ok).toBe(false);
    expect(await labelNames(engine)).toEqual(['Faktúry']);

    server.failOperations = null;
    expect((await engine.services.sync.syncAccount(USER_ID, account.id)).ok).toBe(true);

    const faktury = present((await engine.repositories.labels.list(USER_ID, null))[0]);
    expect(present([...engine.db.tables.threads.values()][0]).labelIds).toEqual([faktury.id]);
    expect(await engine.repositories.pendingWork.list(account.id, 'label-rescan')).toEqual([]);
  });

  it('stores long Gmail label paths and skips the ones Relay cannot hold', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    const long = `Klienti/${'a'.repeat(220)}`;
    server.addMailbox(long, 'label', 601);
    server.addMailbox(`Archív/${'b'.repeat(600)}`, 'label', 602);

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report.ok).toBe(true);
    expect(await labelNames(engine)).toEqual([long]);
  });
});
