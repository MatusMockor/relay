import type { AttachmentId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { alignAttachments } from '../../src/services/bodies/hydrated-attachments';
import { SequentialIdGenerator } from '../support/fakes/infrastructure';
import { deliverMail, present } from '../support/fixtures';
import { backfillUntilDone, storedMessages } from '../support/history';
import {
  ARCHIVE_SIZE,
  backfillAll,
  cutoffOf,
  hasLocalBody,
  isRemote,
  newerThan,
  olderThan,
  setupOffline,
} from '../support/offline-window';
import { USER_ID } from '../support/test-engine';

const byDateDesc = (left: { date: string }, right: { date: string }) =>
  Date.parse(right.date) - Date.parse(left.date);

describe('offline window hydration', () => {
  it('backfills headers of all history and keeps bodies only inside the window', async () => {
    const setup = await setupOffline('3m');

    const reports = await backfillAll(setup);

    expect(reports.at(-1)).toMatchObject({ skipped: false, more: false });
    expect(storedMessages(setup.engine)).toHaveLength(ARCHIVE_SIZE);
    expect(newerThan(setup.engine, '3m').every(hasLocalBody)).toBe(true);
    expect(olderThan(setup.engine, '3m').every(isRemote)).toBe(true);
    const hydrated = reports.reduce(
      (total, report) => total + (report.skipped ? 0 : report.hydrated),
      0,
    );
    expect(hydrated).toBeGreaterThan(0);
    newerThan(setup.engine, '3m').forEach((message) => {
      expect(message.textBody).toBe(`Body of archive-${message.subject.split('-').at(-1) ?? ''}`);
    });
  });

  it('hydrates the newest remote bodies first within the slice budget when the window grows', async () => {
    const setup = await setupOffline('3m', { hydrateMessages: 4 });
    await backfillAll(setup);
    const { engine, seeded } = setup;
    const wanted = storedMessages(engine)
      .filter(isRemote)
      .filter((message) => Date.parse(message.date) >= cutoffOf('1y'))
      .sort(byDateDesc);
    expect(wanted.length).toBeGreaterThan(4);
    engine.events.clear();

    setup.window.set('1y');
    const report = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(report).toMatchObject({ skipped: false, processed: 0, hydrated: 4, more: true });
    const hydrated = storedMessages(engine).filter(
      (message) => hasLocalBody(message) && wanted.some((entry) => entry.id === message.id),
    );
    expect(hydrated.map((message) => message.id).sort()).toEqual(
      wanted
        .slice(0, 4)
        .map((message) => message.id)
        .sort(),
    );
    expect(engine.events.ofType('message.upserted')).toEqual([]);

    await backfillAll(setup);

    expect(newerThan(engine, '1y').every(hasLocalBody)).toBe(true);
    expect(olderThan(engine, '1y').every(isRemote)).toBe(true);
  });

  it('keeps attachment ids of a hydrated message whose parts match the stored list', async () => {
    const setup = await setupOffline('3m', {}, {}, (server) => {
      deliverMail(server, 'Archive', {
        id: 'old-invite',
        date: '2026-01-05T08:00:00.000Z',
        headers: { 'X-Test-Calendar': 'token-1' },
      });
    });
    const { engine } = setup;
    await backfillAll(setup);
    const invite = () =>
      present(storedMessages(engine).find((message) => message.subject === 'Subject old-invite'));
    expect(isRemote(invite())).toBe(true);
    const stored = invite().attachments;
    expect(stored).toHaveLength(1);

    setup.window.set('1y');
    await backfillAll(setup);

    expect(hasLocalBody(invite())).toBe(true);
    expect(invite().attachments).toEqual(stored.map((entry) => ({ ...entry, size: 7 })));
  });

  it('replaces attachment ids when the parsed parts do not match the stored list', () => {
    const ids = new SequentialIdGenerator();
    const stored = [
      {
        id: 'att_stored' as AttachmentId,
        filename: 'zmluva.pdf',
        contentType: 'application/pdf',
        size: 10,
        contentId: null,
        inline: false,
      },
    ];
    const parsed = [
      {
        filename: 'foto.png',
        contentType: 'image/png',
        size: 5,
        contentId: null,
        inline: true,
        checksum: '',
      },
      {
        filename: 'zmluva.pdf',
        contentType: 'application/pdf',
        size: 9,
        contentId: null,
        inline: false,
        checksum: '',
      },
    ];

    const aligned = alignAttachments(stored, parsed, ids);

    expect(aligned.replaced).toBe(true);
    expect(aligned.attachments.map((entry) => entry.filename)).toEqual(['foto.png', 'zmluva.pdf']);
    expect(aligned.attachments.some((entry) => entry.id === 'att_stored')).toBe(false);
    expect(alignAttachments(stored, parsed.slice(1), ids)).toEqual({
      attachments: [{ ...present(stored[0]), size: 9 }],
      replaced: false,
    });
  });

  it('skips messages the server no longer has or fails to send and retries them later', async () => {
    const setup = await setupOffline('3m', { hydrateFetchBatch: 2 });
    await backfillAll(setup);
    const { engine, seeded, archive } = setup;
    const target = present(
      storedMessages(engine)
        .filter((message) => isRemote(message) && message.mailboxId === archive.id)
        .filter((message) => Date.parse(message.date) >= cutoffOf('1y'))
        .sort(byDateDesc)[0],
    );
    seeded.server.mailbox('Archive').messages.delete(target.uid);
    seeded.server.interruptStreamAfter = 1;
    setup.window.set('1y');
    const remoteInWindow = () => newerThan(engine, '1y').filter(isRemote).length;

    const paused = await backfillUntilDone(engine, seeded.account.id, 30);
    const resumed = await backfillUntilDone(engine, seeded.account.id, 30);

    expect(paused.at(-1)).toMatchObject({ skipped: false, more: false });
    expect(resumed.at(-1)).toMatchObject({ skipped: false, more: false });
    expect(
      engine.logger.entries.some((entry) => entry.message === 'Offline body hydration paused'),
    ).toBe(true);
    expect(remoteInWindow()).toBe(3);

    engine.clock.advance(6 * 60 * 60_000 + 1);
    await backfillUntilDone(engine, seeded.account.id, 30);

    expect(remoteInWindow()).toBe(1);
    expect(isRemote(present(engine.db.tables.messages.get(target.id)))).toBe(true);
  });
});
