import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/persistence/migrations/migration-runner';
import { PgMessageAttachmentLookup } from '../../src/persistence/repositories/messages/pg-message-attachment-lookup';
import { buildUser, newId, seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const longCjkSubject = (length: number): string =>
  Array.from({ length }, (_, index) =>
    String.fromCodePoint(0x4e00 + ((index * 7_919 + 13) % 20_000)),
  ).join('');

const window = (since: string, until: string) => ({
  since: new Date(since),
  until: new Date(until),
});

describe('PgMessageRepository.findThreadIdBySubject', () => {
  const context = usePgTestContext();

  it('finds the newest thread with the normalized subject inside the window', async () => {
    const seeded = await seedAccount(context.repositories);
    const old = await seedThread(
      context.repositories,
      seeded,
      { subject: 'Zmluva 2027', lastMessageAt: '2026-11-01T10:00:00.000Z' },
      { subject: 'Zmluva 2027', date: '2026-11-01T10:00:00.000Z' },
    );
    const recent = await seedThread(
      context.repositories,
      seeded,
      { subject: 'AW: Zmluva   2027', lastMessageAt: '2026-11-09T10:00:00.000Z' },
      { subject: 'AW: Zmluva   2027', date: '2026-11-09T10:00:00.000Z' },
    );
    const other = await seedAccount(context.repositories, seeded.user);
    await seedThread(context.repositories, other, { subject: 'Zmluva 2027' });
    const { messages } = context.repositories;

    await expect(
      messages.findThreadIdBySubject(
        seeded.account.id,
        'zmluva 2027',
        window('2026-10-30T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
      ),
    ).resolves.toBe(recent.thread.id);
    await expect(
      messages.findThreadIdBySubject(
        seeded.account.id,
        'zmluva 2027',
        window('2026-10-30T00:00:00.000Z', '2026-11-05T00:00:00.000Z'),
      ),
    ).resolves.toBe(old.thread.id);
    await expect(
      messages.findThreadIdBySubject(
        seeded.account.id,
        'zmluva 2027',
        window('2026-11-10T00:00:00.000Z', '2026-11-12T00:00:00.000Z'),
      ),
    ).resolves.toBeNull();
  });

  it('stores and finds long non-ASCII subjects that exceed the B-tree entry size', async () => {
    const seeded = await seedAccount(context.repositories);
    const subject = longCjkSubject(1_000);
    const { thread } = await seedThread(
      context.repositories,
      seeded,
      { subject, lastMessageAt: '2026-11-03T10:00:00.000Z' },
      { subject, date: '2026-11-03T10:00:00.000Z' },
    );

    await expect(
      context.repositories.messages.findThreadIdBySubject(
        seeded.account.id,
        subject,
        window('2026-11-01T00:00:00.000Z', '2026-11-05T00:00:00.000Z'),
      ),
    ).resolves.toBe(thread.id);
    await expect(
      context.repositories.messages.findThreadIdBySubject(
        seeded.account.id,
        `${subject.slice(0, -1)}x`,
        window('2026-11-01T00:00:00.000Z', '2026-11-05T00:00:00.000Z'),
      ),
    ).resolves.toBeNull();
  });

  it('backfills subjects of rows stored without one when migrations run again', async () => {
    const seeded = await seedAccount(context.repositories);
    await seedThread(
      context.repositories,
      seeded,
      { subject: 'Fwd: Ponuka' },
      { subject: 'Fwd: Ponuka', date: '2026-11-03T10:00:00.000Z' },
    );
    const client = new pg.Client({ connectionString: context.url });
    await client.connect();
    await client.query('UPDATE messages SET normalized_subject = NULL');
    await client.end();

    await runMigrations({ databaseUrl: context.url });

    await expect(
      context.repositories.messages.findThreadIdBySubject(
        seeded.account.id,
        'ponuka',
        window('2026-11-01T00:00:00.000Z', '2026-11-05T00:00:00.000Z'),
      ),
    ).resolves.not.toBeNull();
  });
});

describe('PgMessageAttachmentLookup', () => {
  const context = usePgTestContext();

  it('finds the message that carries an attachment for its owner only', async () => {
    const seeded = await seedAccount(context.repositories);
    const attachmentId = newId('attachment');
    const { message } = await seedThread(
      context.repositories,
      seeded,
      {},
      {
        attachments: [
          {
            id: attachmentId,
            filename: 'zmluva.pdf',
            contentType: 'application/pdf',
            size: 10,
            contentId: null,
            inline: false,
          },
        ],
      },
    );
    const lookup = new PgMessageAttachmentLookup(context.db);

    await expect(lookup.findByAttachmentId(seeded.user.id, attachmentId)).resolves.toMatchObject({
      id: message.id,
    });
    await expect(lookup.findByAttachmentId(buildUser().id, attachmentId)).resolves.toBeNull();
    await expect(
      lookup.findByAttachmentId(seeded.user.id, newId('attachment')),
    ).resolves.toBeNull();
  });
});
