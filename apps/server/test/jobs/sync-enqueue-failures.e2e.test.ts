import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEUES } from '../../src/jobs/queue/queues';
import { SyncScheduler } from '../../src/jobs/sync/sync-scheduler';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser } from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { countQueuedJobs, rejectQueueInserts } from '../support/queue-faults';
import { startTestApp, type TestApp } from '../support/test-app';

describe('sync requests when the job queue rejects inserts', () => {
  let app: TestApp;
  let mailbox: GreenMailUser;

  beforeAll(async () => {
    mailbox = await createGreenMailUser('enqueue');
    app = await startTestApp({ env: { JOBS_ENABLED: 'true', JOBS_TICK_MS: '1000000000' } });
  });

  afterAll(async () => {
    await app.close();
    await deleteGreenMailUser(mailbox);
  });

  it('keeps a created account and retries its sync on the next scheduler tick', async () => {
    const session = await registerUser(app.api, `enq-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    const databaseUrl = app.config.database.url;
    const scheduler = app.app.get(SyncScheduler);

    const fault = await rejectQueueInserts(databaseUrl, QUEUES.syncAccount.name);
    const account = await addImapAccount(app.api, token, mailbox);
    const listed = await app.api.ok(api.accounts.list, {}, token);
    expect(listed.map((item) => item.id)).toEqual([account.id]);

    await expect(scheduler.tick()).rejects.toThrow(/rejects inserts/);
    await fault.clear();
    expect(await countQueuedJobs(databaseUrl, QUEUES.syncAccount.name, account.id)).toBe(0);

    await scheduler.tick();
    expect(await countQueuedJobs(databaseUrl, QUEUES.syncAccount.name, account.id)).toBe(1);
  });
});
