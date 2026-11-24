import { isDeepStrictEqual } from 'node:util';
import { GMAIL_SMALL_SUBJECTS } from '../gmail/gmail-small-inbox';
import type { UpgradeSnapshot } from './upgrade-snapshot';
import type { NewPhaseResult } from './upgrade-new';

export interface ExpectList {
  equal<Value>(label: string, actual: Value, expected: Value): void;
  readonly failures: readonly string[];
}

export const expectList = (step: (label: string) => void): ExpectList => {
  const failures: string[] = [];
  return {
    failures,
    equal: (label, actual, expected) => {
      const shown = JSON.stringify(actual);
      if (isDeepStrictEqual(actual, expected)) {
        step(`ok ${label}: ${shown}`);
        return;
      }
      const failure = `${label}: got ${shown}, expected ${JSON.stringify(expected)}`;
      step(`MISMATCH ${failure}`);
      failures.push(failure);
    },
  };
};

export const checkUpgrade = (
  expect: ExpectList,
  before: UpgradeSnapshot,
  after: NewPhaseResult,
): void => {
  expect.equal('old app: INBOX + All Mail thread messages', before.hostingMessages, 2);
  expect.equal('old app: labelled 3-message thread messages', before.labelledMessages, 6);
  expect.equal('new app: merged within the watch window', after.merge.afterMs !== null, true);
  expect.equal('new app: INBOX + All Mail thread messages', after.snapshot.hostingMessages, 1);
  expect.equal('new app: labelled thread messages', after.snapshot.labelledMessages, 3);
  expect.equal('inbox rows unchanged', after.snapshot.inbox.length, before.inbox.length);
  expect.equal('inbox threads unchanged', after.snapshot.inbox, before.inbox);
  expect.equal('Archív threads unchanged', after.snapshot.archive, before.archive);
  expect.equal('label threads unchanged', after.snapshot.label, before.label);
  expect.equal('search palette hits', after.searchHits, [GMAIL_SMALL_SUBJECTS.hosting]);
  expect.equal('search result rows', after.searchRows, [GMAIL_SMALL_SUBJECTS.hosting]);
  expect.equal('search opens the merged thread with', after.searchOpenedMessages, 1);
  expect.equal('restored thread messages', after.restoredMessages, 1);
};
