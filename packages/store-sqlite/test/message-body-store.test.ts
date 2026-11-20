import type { AttachmentId, Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { createSqliteMessageBodies } from '../src';
import { bodyMessage, ftsCount, queryPlan, seedBodyRows } from './support/body-store-seed';
import { accountId, messageId } from './support/fixtures';
import { type SeededAccount, seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const CUTOFF = new Date('2026-05-20T00:00:00.000Z');

const old = (seeded: SeededAccount, index: number, overrides: Partial<Message> = {}) =>
  bodyMessage(seeded, index, 400 + index, {
    subject: `Zmluva ${String(index)}`,
    snippet: 'Posielam podpísanú zmluvu',
    textBody: `Dohodnutá zľava ${String(index)} percent na stavebný materiál`,
    ...overrides,
  });

const setup = async () => {
  const store = createTestStore();
  const seeded = await seedAccount(store.repositories);
  const other = await seedAccount(store.repositories, {
    id: accountId('acc-2'),
    email: 'druhy@firma.sk',
  });
  return { store, seeded, other, bodies: createSqliteMessageBodies(store.database) };
};

const read = async (store: TestStore, seeded: SeededAccount, id: string) =>
  store.repositories.messages.findById(seeded.account.userId, messageId(id));

describe('sqlite message body store', () => {
  it('evicts old local bodies in chunks and keeps headers and snippet searchable', async () => {
    const { store, seeded, other, bodies } = await setup();
    seedBodyRows(store, [
      old(seeded, 1),
      old(seeded, 2),
      old(seeded, 3),
      bodyMessage(seeded, 4, 10, { textBody: 'Nová ponuka na zľavu' }),
      old(seeded, 5, { uid: 0 }),
      old(other, 6, { id: messageId('foreign'), mailboxId: other.inbox.id }),
    ]);
    expect(ftsCount(store, 'stavebny')).toBe(5);

    expect(await bodies.evictBefore(seeded.account.id, CUTOFF, 2)).toBe(2);
    expect(await bodies.evictBefore(seeded.account.id, CUTOFF, 2)).toBe(1);
    expect(await bodies.evictBefore(seeded.account.id, CUTOFF, 2)).toBe(0);

    const evicted = await read(store, seeded, 'body-1');
    expect(evicted).toMatchObject({
      bodyState: 'remote',
      textBody: null,
      htmlBody: null,
      subject: 'Zmluva 1',
      snippet: 'Posielam podpísanú zmluvu',
    });
    expect((await read(store, seeded, 'body-4'))?.textBody).toBe('Nová ponuka na zľavu');
    expect((await read(store, seeded, 'body-5'))?.bodyState).toBeUndefined();
    expect(ftsCount(store, 'stavebny')).toBe(2);
    expect(ftsCount(store, 'zmluva')).toBe(5);
    expect(ftsCount(store, 'podpisanu')).toBe(5);
    expect(ftsCount(store, 'novakova')).toBe(6);
    expect(await bodies.stats(seeded.account.id)).toEqual({ local: 2, remote: 3 });
    expect(await bodies.stats(other.account.id)).toEqual({ local: 1, remote: 0 });
  });

  it('lists remote rows newest first inside the window and saves a hydrated body back', async () => {
    const { store, seeded, bodies } = await setup();
    const remote = { textBody: null, htmlBody: null, bodyState: 'remote' as const };
    seedBodyRows(store, [
      bodyMessage(seeded, 1, 30, remote),
      bodyMessage(seeded, 2, 5, remote),
      bodyMessage(seeded, 3, 300, remote),
      bodyMessage(seeded, 4, 1, { ...remote, uid: 0 }),
      bodyMessage(seeded, 5, 2),
      bodyMessage(seeded, 6, 3, remote),
    ]);

    const candidates = await bodies.hydrationCandidates(seeded.account.id, CUTOFF, 10, [
      messageId('body-6'),
    ]);

    expect(candidates.map((candidate) => candidate.messageId)).toEqual(['body-2', 'body-1']);
    expect(candidates[0]).toMatchObject({
      mailboxId: seeded.inbox.id,
      uid: 3,
      messageIdHeader: '<body-2@klient.sk>',
      attachments: [],
    });
    expect(
      (await bodies.hydrationCandidates(seeded.account.id, null, 2, [])).map(
        (candidate) => candidate.messageId,
      ),
    ).toEqual(['body-6', 'body-2']);
    const attachment = {
      id: 'att-1' as AttachmentId,
      filename: 'zmluva.pdf',
      contentType: 'application/pdf',
      size: 120,
      contentId: null,
      inline: false,
    };
    const body = {
      textBody: 'Telo zo servera o hydratácii',
      htmlBody: '<p>Telo</p>',
      snippet: 'Telo zo servera',
      attachments: [attachment],
    };

    expect(await bodies.saveBody(messageId('body-2'), body)).toBe(true);
    expect(await bodies.saveBody(messageId('body-5'), body)).toBe(false);

    const saved = await read(store, seeded, 'body-2');
    expect(saved).toMatchObject({ textBody: body.textBody, htmlBody: '<p>Telo</p>' });
    expect(saved?.bodyState).toBeUndefined();
    expect(saved?.attachments).toEqual([attachment]);
    expect(ftsCount(store, 'hydratacii')).toBe(1);
    expect((await read(store, seeded, 'body-5'))?.textBody).toBe(
      'Dobrý deň, posielam faktúru za október.',
    );
  });

  it('serves eviction and hydration from the body date index', async () => {
    const { store, seeded } = await setup();
    const evictPlan = queryPlan(
      store,
      `select seq from messages where account_id = ? and body_state = 'local' and date_ts < ? and uid <> 0 order by date_ts asc limit 200`,
      [seeded.account.id, CUTOFF.getTime()],
    );
    const hydratePlan = queryPlan(
      store,
      `select id from messages where account_id = ? and body_state = 'remote' and date_ts >= ? and uid <> 0 order by date_ts desc, seq desc limit 50`,
      [seeded.account.id, CUTOFF.getTime()],
    );

    expect(evictPlan).toContain('messages_account_body_date_idx');
    expect(evictPlan).not.toContain('TEMP B-TREE');
    expect(hydratePlan).toContain('messages_account_body_date_idx');
    expect(hydratePlan).not.toContain('TEMP B-TREE');
  });
});
