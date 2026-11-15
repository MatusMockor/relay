import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { api, type AuthSession, type ClaimedAiJob } from '@relay/shared/api';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loginUser, registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { authenticateRealtime } from '../support/realtime-client';
import { startTestApp, type TestApp } from '../support/test-app';

const LEASE_MS = 120_000;

describe('AI jobs run by a desktop worker', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let partner: GreenMailUser;
  let ownerImap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('aiworker');
    partner = await createGreenMailUser('aipartner');
    ownerImap = await openImap(owner);
    await ownerImap.append(
      'INBOX',
      rawMail({
        from: partner.email,
        to: owner.email,
        subject: 'Invoice 42',
        body: 'Please pay by Friday.',
      }),
    );
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await Promise.all([owner, partner].map((user) => deleteGreenMailUser(user)));
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

  const queueChat = (token: string) =>
    app.api.ok(
      api.ai.createJob,
      {
        body: {
          input: { kind: 'chatAnswer', question: 'Čo je nové?', threadId: null, history: [] },
        },
      },
      token,
    );

  const claimOne = async (token: string): Promise<ClaimedAiJob> => {
    const batch = await app.api.ok(api.ai.claimJobs, { body: { limit: 1 } }, token);
    expect(batch.jobs).toHaveLength(1);
    const [claim] = batch.jobs;
    expect(claim).toBeDefined();
    return claim as ClaimedAiJob;
  };

  it('claims the automatic one-liner, completes it and stores the result on the thread', async () => {
    const session = await localUser('worker');
    const token = session.accessToken;
    const socket = await authenticateRealtime(app.baseUrl, token);
    await addImapAccount(app.api, token, owner);
    const [thread] = await waitForInbox(app.api, token, (items) => items.length === 1);
    expect(thread).toBeDefined();

    let claims: ClaimedAiJob[] = [];
    await expect
      .poll(
        async () => {
          claims = (await app.api.ok(api.ai.claimJobs, { body: { limit: 5 } }, token)).jobs;
          return claims.length;
        },
        { timeout: 20_000, interval: 250 },
      )
      .toBe(1);
    const [claim] = claims;
    expect(claim?.job).toMatchObject({
      kind: 'oneLiner',
      status: 'running',
      runnerLocation: 'local',
      input: { kind: 'oneLiner', threadId: thread?.id },
    });
    expect(claim?.thread?.thread.id).toBe(thread?.id);
    expect(claim?.thread?.messages[0]?.subject).toBe('Invoice 42');
    if (claim === undefined || thread === undefined) {
      return;
    }

    const lease = await app.api.ok(
      api.ai.heartbeatJob,
      { params: { id: claim.job.id }, body: { leaseId: claim.leaseId } },
      token,
    );
    expect(Date.parse(lease.leaseUntil)).toBe(app.clock.now().getTime() + LEASE_MS);

    const otherDevice = await loginUser(app.api, session.user.email);
    const stolen = await app.api.fail(
      api.ai.completeJob,
      {
        params: { id: claim.job.id },
        body: {
          leaseId: claim.leaseId,
          runner: 'claude',
          output: { kind: 'oneLiner', text: 'Cudzí' },
        },
      },
      otherDevice.accessToken,
    );
    expect(stolen).toMatchObject({ status: 409, error: { code: 'conflict' } });
    const wrongKind = await app.api.fail(
      api.ai.completeJob,
      {
        params: { id: claim.job.id },
        body: {
          leaseId: claim.leaseId,
          runner: 'claude',
          output: { kind: 'rewrite', text: 'Iné' },
        },
      },
      token,
    );
    expect(wrongKind.status).toBe(400);

    const done = await app.api.ok(
      api.ai.completeJob,
      {
        params: { id: claim.job.id },
        body: {
          leaseId: claim.leaseId,
          runner: 'codex',
          output: { kind: 'oneLiner', text: 'Faktúra na úhradu do piatku' },
        },
      },
      token,
    );
    expect(done).toMatchObject({ status: 'done', output: { text: 'Faktúra na úhradu do piatku' } });

    const detail = await app.api.ok(api.threads.get, { params: { id: thread.id } }, token);
    expect(detail.thread.aiOneLiner).toBe('Faktúra na úhradu do piatku');
    await socket.waitFor(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'ai.job.updated' &&
        message.event.data.job.id === claim.job.id &&
        message.event.data.job.status === 'done',
    );
    await socket.waitFor(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'thread.upserted' &&
        message.event.data.thread.aiOneLiner === 'Faktúra na úhradu do piatku',
    );
    const again = await app.api.fail(
      api.ai.completeJob,
      {
        params: { id: claim.job.id },
        body: { leaseId: claim.leaseId, runner: 'codex', output: { kind: 'oneLiner', text: 'x' } },
      },
      token,
    );
    expect(again.status).toBe(409);
    socket.close();
  });

  it('claims nothing while the user runs AI on the server', async () => {
    const session = await registerUser(app.api, `srv-${randomUUID().slice(0, 8)}@relay.test`);
    expect(await app.api.ok(api.ai.claimJobs, { body: { limit: 5 } }, session.accessToken)).toEqual(
      { location: 'server', jobs: [] },
    );
  });

  it('makes a job reclaimable when its lease expires and fences the first device', async () => {
    const session = await localUser('lease');
    const job = await queueChat(session.accessToken);
    const first = await claimOne(session.accessToken);
    expect(first.job.id).toBe(job.id);
    const desk = await loginUser(app.api, session.user.email);
    expect(
      (await app.api.ok(api.ai.claimJobs, { body: { limit: 1 } }, desk.accessToken)).jobs,
    ).toEqual([]);

    app.clock.advance(LEASE_MS + 1_000);
    const second = await claimOne(desk.accessToken);
    expect(second.job.id).toBe(job.id);

    const late = await app.api.fail(
      api.ai.heartbeatJob,
      { params: { id: job.id }, body: { leaseId: first.leaseId } },
      session.accessToken,
    );
    expect(late.status).toBe(409);
    const failed = await app.api.ok(
      api.ai.failJob,
      {
        params: { id: job.id },
        body: { leaseId: second.leaseId, code: 'not_authenticated', message: 'claude login' },
      },
      desk.accessToken,
    );
    expect(failed).toMatchObject({ status: 'error', error: 'not_authenticated: claude login' });
  });
});
