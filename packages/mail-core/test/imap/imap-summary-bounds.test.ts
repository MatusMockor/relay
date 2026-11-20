import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PREVIEW_FETCH_GROUP_SIZE } from '../../src/imap/fetch-summaries';
import { MAX_PREVIEW_PART_BYTES } from '../../src/imap/preview-part';
import { previewFetches, recordFetches, type RecordedFetch } from '../support/fetch-recorder';
import {
  appendFixture,
  createSummaryHarness,
  measuredSummaries,
  type SummaryHarness,
} from '../support/summary-harness';
import { htmlPart, message, multipart, textPart } from '../support/summary-mime';

const OVERSIZED_TEXT = 'Veľmi dlhý text. '.repeat(Math.ceil(MAX_PREVIEW_PART_BYTES / 16) + 10);

const plainOnly = (id: string, text: string): Uint8Array =>
  message({ id, subject: 'Text', contentType: 'text/plain; charset=utf-8', encoding: '8bit' }, [
    Buffer.from(text, 'utf8').toString('latin1'),
    '',
  ]);

const oversizedAlternative = (): Uint8Array =>
  message(
    { id: 'big-alt', subject: 'Alternatíva', contentType: 'multipart/alternative; boundary="b"' },
    multipart('b', [textPart(OVERSIZED_TEXT), htmlPart('<p>Krátka <b>HTML</b> verzia.</p>')]),
  );

describe('ImapMailProvider.fetchSummaries preview bounds against GreenMail', () => {
  let harness: SummaryHarness;
  let uidValidity: number;
  let calls: RecordedFetch[];

  beforeEach(async () => {
    calls = [];
    harness = await createSummaryHarness(recordFetches(calls));
    uidValidity = (await harness.provider.status('INBOX')).uidValidity;
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it('does not fetch a preview of a text part larger than the preview limit', async () => {
    const uid = await appendFixture(harness, plainOnly('big', OVERSIZED_TEXT));
    calls.length = 0;

    const { summaries, received } = await measuredSummaries(harness, uidValidity, [uid]);

    expect(summaries.map((summary) => summary.snippet)).toEqual(['']);
    expect(previewFetches(calls)).toEqual([]);
    expect(received).toBeLessThan(8 * 1024);
  });

  it('previews the HTML alternative when the plain text part is too large', async () => {
    const uid = await appendFixture(harness, oversizedAlternative());
    calls.length = 0;

    const summaries = await harness.provider.fetchSummaries('INBOX', uidValidity, [uid]);

    expect(summaries.map((summary) => summary.snippet)).toEqual(['Krátka HTML verzia.']);
    expect(previewFetches(calls)).toEqual([{ uids: [uid], bodyParts: ['2'] }]);
  });

  it('fetches previews in groups of a bounded size', async () => {
    const uids: number[] = [];
    for (let index = 0; index < 2 * PREVIEW_FETCH_GROUP_SIZE + 3; index += 1) {
      uids.push(
        await appendFixture(
          harness,
          plainOnly(`small-${String(index)}`, `Správa ${String(index)}`),
        ),
      );
    }
    calls.length = 0;

    const summaries = await harness.provider.fetchSummaries('INBOX', uidValidity, uids);
    const previews = previewFetches(calls);

    expect(summaries.map((summary) => summary.snippet)).toEqual(
      uids.map((_, index) => `Správa ${String(index)}`),
    );
    expect(previews.map((call) => call.uids.length)).toEqual([
      PREVIEW_FETCH_GROUP_SIZE,
      PREVIEW_FETCH_GROUP_SIZE,
      3,
    ]);
    expect(previews.flatMap((call) => call.uids)).toEqual(uids);
  });
});
