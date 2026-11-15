import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { type AiResultRepository, PORT_TOKENS } from '@relay/engine';
import { api } from '@relay/shared/api';
import { AiResultIdSchema } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

describe('PATCH /threads/:id/checklist', () => {
  let app: TestApp;
  let owner: GreenMailUser;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
    owner = await createGreenMailUser('check');
    const imap = await openImap(owner);
    await imap.append(
      'INBOX',
      rawMail({ from: 'jana@klient.sk', to: owner.email, subject: 'Zmluva', body: 'Podpíšte' }),
    );
    await imap.logout();
  });

  afterAll(async () => {
    await app.close();
    await deleteGreenMailUser(owner);
  });

  it('stores ticks in the summary and returns them in the thread detail', async () => {
    const session = await registerUser(app.api, `check-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    await app.api.ok(
      api.settings.update,
      { body: { ai: { features: { oneLiners: false } } } },
      token,
    );
    await addImapAccount(app.api, token, owner);
    const [thread] = await waitForInbox(app.api, token, (threads) => threads.length === 1);
    expect(thread).toBeDefined();
    if (thread === undefined) {
      return;
    }
    const missing = await app.api.fail(
      api.threads.updateChecklist,
      { params: { id: thread.id }, body: { itemId: 'c1', done: true } },
      token,
    );
    expect(missing.status).toBe(404);
    await app.app.get<AiResultRepository>(PORT_TOKENS.AiResultRepository).save({
      id: AiResultIdSchema.parse(`air_${randomUUID().slice(0, 8)}`),
      userId: session.user.id,
      threadId: thread.id,
      sourceMessageId: null,
      runner: 'claude',
      output: {
        kind: 'summary',
        summary: 'Treba podpísať zmluvu.',
        checklist: [
          { id: 'c1', text: 'Prečítať', done: false },
          { id: 'c2', text: 'Podpísať', done: false },
        ],
      },
      createdAt: new Date().toISOString(),
    });

    const ticked = await app.api.ok(
      api.threads.updateChecklist,
      { params: { id: thread.id }, body: { itemId: 'c1', done: true } },
      token,
    );

    expect(ticked.checklist.map((item) => item.done)).toEqual([true, false]);
    const detail = await app.api.ok(api.threads.get, { params: { id: thread.id } }, token);
    expect(detail.checklist).toEqual(ticked.checklist);
    const unknown = await app.api.fail(
      api.threads.updateChecklist,
      { params: { id: thread.id }, body: { itemId: 'nope', done: true } },
      token,
    );
    expect(unknown).toMatchObject({ status: 404, error: { code: 'not_found' } });
    const stranger = await registerUser(app.api, `check-x-${randomUUID().slice(0, 8)}@relay.test`);
    const foreign = await app.api.fail(
      api.threads.updateChecklist,
      { params: { id: thread.id }, body: { itemId: 'c1', done: false } },
      stranger.accessToken,
    );
    expect(foreign.status).toBe(404);
  });
});
