import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { type AttachmentStore, PORT_TOKENS } from '@relay/engine';
import { api, type AuthSession, buildUrl, type DraftAttachmentAdded } from '@relay/shared/api';
import type { AttachmentId, MailAccount } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttachmentSweepScheduler } from '../../src/attachments/attachment-sweep-scheduler';
import type { DbExecutor } from '../../src/persistence/database/database';
import { DRIZZLE_DB } from '../../src/persistence/persistence.tokens';
import { attachments } from '../../src/persistence/schema';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser } from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;
const bytes = (text: string) => new TextEncoder().encode(text);

describe('attachment sweep job', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let session: AuthSession;
  let account: MailAccount;
  let store: AttachmentStore;
  let db: DbExecutor;

  const exists = async (id: AttachmentId) => (await store.get(session.user.id, id)) !== null;

  const age = (id: AttachmentId) =>
    db
      .update(attachments)
      .set({ createdAt: new Date(Date.now() - 2 * DAY_MS) })
      .where(eq(attachments.id, id));

  const orphan = (text: string) =>
    store.put(session.user.id, {
      filename: `${text}.txt`,
      contentType: 'text/plain',
      content: bytes(text),
    });

  const draftWithAttachment = async (): Promise<DraftAttachmentAdded> => {
    const draft = await app.api.ok(
      api.compose.createDraft,
      {
        body: {
          accountId: account.id,
          to: [{ name: 'Eva', email: 'eva@firma.sk' }],
          cc: [],
          bcc: [],
          subject: 'Ponuka',
          body: 'V prílohe.',
          inReplyToThreadId: null,
          inReplyToMessageId: null,
          attachments: [],
        },
      },
      session.accessToken,
    );
    const response = await fetch(
      buildUrl(app.baseUrl, api.draftAttachments.add, {
        params: { id: draft.id },
        query: { filename: 'ponuka.txt', contentType: 'text/plain' },
      }),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          'content-type': 'application/octet-stream',
        },
        body: bytes('ponuka'),
      },
    );
    expect(response.status).toBe(200);
    return (await response.json()) as DraftAttachmentAdded;
  };

  beforeAll(async () => {
    owner = await createGreenMailUser('swp');
    app = await startTestApp({ env: { JOBS_ENABLED: 'true', IMAP_IDLE_ENABLED: 'false' } });
    session = await registerUser(app.api, `swp-${randomUUID().slice(0, 8)}@relay.test`);
    account = await addImapAccount(app.api, session.accessToken, owner);
    store = app.app.get<AttachmentStore>(PORT_TOKENS.AttachmentStore);
    db = app.app.get<DbExecutor>(DRIZZLE_DB);
  });

  afterAll(async () => {
    await app.close();
    await deleteGreenMailUser(owner);
  });

  it('removes old orphaned blobs through pg-boss and keeps referenced and fresh ones', async () => {
    const { attachment: attached } = await draftWithAttachment();
    const old = await orphan('old');
    const fresh = await orphan('fresh');
    await age(old.id);
    await age(attached.id);

    await app.app.get(AttachmentSweepScheduler).enqueue();

    await expect.poll(() => exists(old.id), { timeout: 15_000, interval: 100 }).toBe(false);
    expect(await exists(fresh.id)).toBe(true);
    const content = await fetch(
      buildUrl(app.baseUrl, api.attachments.content, { params: { id: attached.id } }),
      { headers: { authorization: `Bearer ${session.accessToken}` } },
    );
    expect(content.status).toBe(200);
    expect(await content.text()).toBe('ponuka');
  });

  it('removes the blobs of draft attachments when their account is removed', async () => {
    const { attachment: attached } = await draftWithAttachment();
    const unrelated = await orphan('unrelated');

    await app.api.ok(api.accounts.remove, { params: { id: account.id } }, session.accessToken);

    expect(await exists(attached.id)).toBe(false);
    expect(await exists(unrelated.id)).toBe(true);
  });
});
