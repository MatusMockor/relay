import { randomUUID } from 'node:crypto';
import { api, type AuthSession, type ClaimedAiJob } from '@relay/shared/api';
import { RuleSuggestionSchema } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { startTestApp, type TestApp } from '../support/test-app';

describe('rule suggestions run by a desktop worker', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
  });

  const localUser = async (prefix: string): Promise<AuthSession> => {
    const session = await registerUser(app.api, `${prefix}-${randomUUID().slice(0, 8)}@relay.test`);
    await app.api.ok(
      api.settings.update,
      { body: { ai: { location: 'local' } } },
      session.accessToken,
    );
    return session;
  };

  const claimOne = async (token: string): Promise<ClaimedAiJob> => {
    const batch = await app.api.ok(api.ai.claimJobs, { body: { limit: 1 } }, token);
    expect(batch.jobs).toHaveLength(1);
    const [claim] = batch.jobs;
    expect(claim).toBeDefined();
    return claim as ClaimedAiJob;
  };

  it('queues a rule suggestion for the desktop worker and keeps its resolved output', async () => {
    const session = await localUser('rules');
    const token = session.accessToken;
    const accountId = 'acc_freelance';
    const job = await app.api.ok(
      api.ai.createJob,
      {
        body: {
          input: {
            kind: 'ruleSuggest',
            sentence: 'faktúry s prílohou daj do štítku Faktúry',
            accountId,
            accounts: [
              {
                id: accountId,
                name: 'Freelance',
                labels: [{ id: 'lbl_invoices', name: 'Faktúry' }],
                folders: [],
              },
            ],
          },
        },
      },
      token,
    );
    expect(job).toMatchObject({ kind: 'ruleSuggest', status: 'queued', runnerLocation: 'local' });

    const claim = await claimOne(token);
    expect(claim.job.id).toBe(job.id);
    expect(claim.thread).toBeNull();
    const suggestion = RuleSuggestionSchema.parse({
      name: 'Faktúry',
      accountId,
      match: 'all',
      conditions: [{ type: 'hasAttachment' }],
      exceptions: [],
      actions: [{ type: 'addLabel', labelId: 'lbl_invoices' }],
      understood: 'Maily s prílohou dostanú štítok Faktúry.',
      unmapped: [],
    });
    const oversized = await app.api.fail(
      api.ai.completeJob,
      {
        params: { id: job.id },
        body: {
          leaseId: claim.leaseId,
          runner: 'claude',
          output: {
            kind: 'ruleSuggest',
            suggestion: { ...suggestion, unmapped: ['x'.repeat(201)] },
          },
        },
      },
      token,
    );
    expect(oversized.status).toBe(400);

    const done = await app.api.ok(
      api.ai.completeJob,
      {
        params: { id: job.id },
        body: {
          leaseId: claim.leaseId,
          runner: 'claude',
          output: { kind: 'ruleSuggest', suggestion },
        },
      },
      token,
    );
    expect(done).toMatchObject({ status: 'done', output: { kind: 'ruleSuggest', suggestion } });
    expect(await app.api.ok(api.ai.getJob, { params: { id: job.id } }, token)).toMatchObject({
      status: 'done',
      output: { kind: 'ruleSuggest', suggestion },
    });
  });
});
