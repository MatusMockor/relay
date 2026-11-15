import { AttachmentIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteMessageAttachmentLookup, LOCAL_USER_ID } from '../src';
import { buildMessage, NO_HEADERS, userId } from './support/fixtures';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const attachmentId = (value: string) => AttachmentIdSchema.parse(value);

describe('SqliteMessageAttachmentLookup', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('finds the message carrying an attachment for its owner only', async () => {
    const seeded = await seedAccount(store.repositories);
    await store.repositories.messages.upsert(
      buildMessage({
        mailboxId: seeded.inbox.id,
        attachments: [
          {
            id: attachmentId('att-1'),
            filename: 'zmluva.pdf',
            contentType: 'application/pdf',
            size: 10,
            contentId: null,
            inline: false,
          },
          {
            id: attachmentId('att-2'),
            filename: null,
            contentType: 'image/png',
            size: 4,
            contentId: 'logo',
            inline: true,
          },
        ],
      }),
      NO_HEADERS,
    );
    const lookup = createSqliteMessageAttachmentLookup(store.database);

    expect(await lookup.findByAttachmentId(LOCAL_USER_ID, attachmentId('att-2'))).toMatchObject({
      id: 'msg-1',
      attachments: [{ id: 'att-1' }, { id: 'att-2' }],
    });
    expect(await lookup.findByAttachmentId(LOCAL_USER_ID, attachmentId('att-3'))).toBeNull();
    expect(await lookup.findByAttachmentId(userId('intruder'), attachmentId('att-1'))).toBeNull();
  });
});
