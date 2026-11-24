import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UidValidityChangedError } from '../../src';
import { summaryFixtures } from '../support/summary-fixtures';
import {
  appendFixture,
  createSummaryHarness,
  type SummaryHarness,
} from '../support/summary-harness';

describe('ImapMailProvider.fetchEmailIds against GreenMail', () => {
  let harness: SummaryHarness;
  let uidValidity: number;

  beforeEach(async () => {
    harness = await createSummaryHarness();
    uidValidity = (await harness.provider.status('INBOX')).uidValidity;
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it('returns the stored UIDs sorted, without an email id on a server without X-GM-EXT-1', async () => {
    const source = summaryFixtures()[0]?.source ?? new Uint8Array();
    const first = await appendFixture(harness, source);
    const second = await appendFixture(harness, source);

    const resolved = await harness.provider.fetchEmailIds('INBOX', uidValidity, [
      second,
      9_999,
      first,
    ]);

    expect(resolved).toEqual([
      { uid: first, emailId: null },
      { uid: second, emailId: null },
    ]);
  });

  it('returns nothing for no UIDs and rejects a changed UIDVALIDITY', async () => {
    const uid = await appendFixture(harness, summaryFixtures()[0]?.source ?? new Uint8Array());

    await expect(harness.provider.fetchEmailIds('INBOX', uidValidity, [])).resolves.toEqual([]);
    await expect(
      harness.provider.fetchEmailIds('INBOX', uidValidity + 1, [uid]),
    ).rejects.toBeInstanceOf(UidValidityChangedError);
  });
});
