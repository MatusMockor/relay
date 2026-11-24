import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UidValidityChangedError } from '../../src';
import { expectSummaryMatchesFullParse } from '../support/summary-assertions';
import { summaryFixtures } from '../support/summary-fixtures';
import {
  appendFixture,
  attachmentShape,
  createSummaryHarness,
  measuredSummaries,
  type SummaryHarness,
} from '../support/summary-harness';

describe('ImapMailProvider.fetchSummaries against GreenMail', () => {
  let harness: SummaryHarness;
  let uidValidity: number;

  beforeEach(async () => {
    harness = await createSummaryHarness();
    uidValidity = (await harness.provider.status('INBOX')).uidValidity;
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it.each(summaryFixtures())('matches a full parse of the $name fixture', async (fixture) => {
    const uid = await appendFixture(harness, fixture.source, fixture.flags);
    await harness.provider.listUids('INBOX');
    const { summaries, received } = await measuredSummaries(harness, uidValidity, [uid]);
    const raw = await harness.provider.fetchMessage('INBOX', uid);
    const full = await harness.parser.parse(raw?.source ?? new Uint8Array());
    const summary = summaries[0];
    expect(summaries.map((entry) => entry.uid)).toEqual([uid]);
    expect(summary).toBeDefined();
    if (summary === undefined) {
      return;
    }
    const header = await harness.parser.parse(summary.header);
    console.info(
      `summary wire bytes ${fixture.name}: ${String(received)} (full ${String(raw?.size)})`,
    );

    expectSummaryMatchesFullParse(fixture, summary, header, full);
    expect(received).toBeLessThan(fixture.maxWireBytes);
    expect(summary.size).toBe(raw?.size);
    expect(summary.internalDate).toBe(raw?.internalDate);
  });

  it('reads flags and keywords and returns a batch sorted by UID', async () => {
    const fixtures = summaryFixtures();
    const uids: number[] = [];
    for (const fixture of fixtures) {
      uids.push(await appendFixture(harness, fixture.source, fixture.flags));
    }

    const summaries = await harness.provider.fetchSummaries('INBOX', uidValidity, [
      ...uids.reverse(),
      9_999,
    ]);

    expect(summaries.map((summary) => summary.uid)).toEqual([...uids].reverse());
    expect(summaries[0]).toMatchObject({
      flags: { seen: true, flagged: true, answered: false },
      keywords: ['Projekt'],
      labels: null,
    });
    expect(summaries[1]).toMatchObject({
      flags: { seen: false, flagged: false, answered: false },
      keywords: [],
    });
    const single = await harness.provider.fetchSummaries('INBOX', uidValidity, [uids[0] ?? 0]);
    expect(single[0]?.attachments.map(attachmentShape)).toEqual(
      summaries.at(-1)?.attachments.map(attachmentShape),
    );
  });

  it('returns nothing for no UIDs and rejects a changed UIDVALIDITY', async () => {
    const uid = await appendFixture(harness, summaryFixtures()[0]?.source ?? new Uint8Array());

    await expect(harness.provider.fetchSummaries('INBOX', uidValidity, [])).resolves.toEqual([]);
    await expect(
      harness.provider.fetchSummaries('INBOX', uidValidity + 1, [uid]),
    ).rejects.toBeInstanceOf(UidValidityChangedError);
  });

  it('gets no HEADER.FIELDS.NOT data through imapflow bodyParts but honours partial fetches', async () => {
    const uid = await appendFixture(harness, summaryFixtures()[0]?.source ?? new Uint8Array());
    const lock = await harness.admin.getMailboxLock('INBOX');
    const excluded = await harness.admin.fetchOne(
      String(uid),
      { bodyParts: ['HEADER.FIELDS.NOT (RECEIVED)'] },
      { uid: true },
    );
    const partial = await harness.admin.fetchOne(
      String(uid),
      { bodyParts: [{ key: 'TEXT', start: 0, maxLength: 10 }] },
      { uid: true },
    );
    lock.release();

    const keys = excluded === false ? [] : [...(excluded.bodyParts?.keys() ?? [])];
    expect(excluded === false ? undefined : excluded.headers).toBeUndefined();
    expect(keys.every((key) => key.startsWith('"'))).toBe(true);
    expect(partial === false ? [] : [...(partial.bodyParts?.keys() ?? [])]).toEqual(['text']);
    expect(partial === false ? 0 : partial.bodyParts?.get('text')?.length).toBe(10);
  });
});

describe('ImapMailProvider.listUids with a UID range against GreenMail', () => {
  let harness: SummaryHarness;

  beforeEach(async () => {
    harness = await createSummaryHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it('returns only UIDs inside the range', async () => {
    const source = summaryFixtures()[0]?.source ?? new Uint8Array();
    const uids: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      uids.push(await appendFixture(harness, source));
    }
    const [first = 0, second = 0, , fourth = 0, fifth = 0] = uids;

    await expect(
      harness.provider.listUids('INBOX', { range: { from: second, to: fourth } }),
    ).resolves.toEqual(uids.slice(1, 4));
    await expect(
      harness.provider.listUids('INBOX', { range: { from: fifth + 1, to: fifth + 100 } }),
    ).resolves.toEqual([]);
    await expect(
      harness.provider.listUids('INBOX', { range: { from: fourth, to: first }, fresh: true }),
    ).resolves.toEqual([]);
    await expect(
      harness.provider.listUids('INBOX', { range: { from: 1, to: fifth }, fresh: true }),
    ).resolves.toEqual(uids);
  });
});
