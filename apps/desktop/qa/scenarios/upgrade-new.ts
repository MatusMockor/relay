import { runAction } from '../app/actions';
import { waitForInbox, waitForRowCount } from '../app/inbox';
import { searchHits, showAllResults } from '../app/palette';
import { closeThread, metaMessageCount, openThread } from '../app/thread-view';
import { GMAIL } from '../gmail/gmail-layout';
import { GMAIL_SMALL_SUBJECTS, gmailSmallMessageId } from '../gmail/gmail-small-inbox';
import { exactly, expectListed, expectServer, including } from './gmail-expect';
import { observer } from './gmail-observer';
import type { GmailScenarioContext } from './gmail-scenario';
import { SMALL_INBOX_THREADS } from './gmail-small-sync';
import { stepRecorder } from './scenario-steps';
import { type MergeObservation, waitForMergedThread } from './upgrade-merge-wait';
import { takeSnapshot, type UpgradeSnapshot } from './upgrade-snapshot';

const HOSTING = GMAIL_SMALL_SUBJECTS.hosting;
const HOSTING_ID = gmailSmallMessageId(HOSTING);

export interface NewPhaseResult {
  readonly merge: MergeObservation;
  readonly snapshot: UpgradeSnapshot;
  readonly searchHits: readonly string[];
  readonly searchRows: readonly string[];
  readonly searchOpenedMessages: number | null;
  readonly restoredMessages: number | null;
  readonly failures: readonly string[];
}

interface Observed {
  hits: readonly string[];
  rows: readonly string[];
  opened: number | null;
  restored: number | null;
}

const search = async (context: GmailScenarioContext, observed: Observed): Promise<void> => {
  const { page } = context;
  observed.hits = await searchHits(page, 'hosting');
  context.step(`search palette "hosting" lists ${String(observed.hits.length)} local hits`);
  await context.screenshot('new-search-palette');
  await showAllResults(page);
  await waitForRowCount(page, observed.hits.length);
  await expectListed(context, 'Výsledky hľadania', HOSTING, true);
  observed.rows = await observer(context).list('search "hosting" results');
  await context.screenshot('new-search-results');
  const facts = await observer(context).thread(HOSTING, 'new-search-opened-thread');
  observed.opened = metaMessageCount(facts.meta);
  await closeThread(page);
  await runAction(page, { kind: 'goto', view: 'inbox' });
};

const doneAndRestore = async (context: GmailScenarioContext, observed: Observed) => {
  const { page, screenshot } = context;
  await openThread(page, HOSTING);
  await runAction(page, { kind: 'done' });
  await runAction(page, { kind: 'back' });
  await expectListed(context, 'Doručená pošta po Hotovo', HOSTING, false);
  await screenshot('new-inbox-after-done');
  await expectServer(context, HOSTING_ID, 'Hotovo', exactly(GMAIL.allMail));
  await runAction(page, { kind: 'goto', view: 'done' });
  await expectListed(context, 'Hotovo', HOSTING, true);
  await screenshot('new-done-view');
  await openThread(page, HOSTING);
  await runAction(page, { kind: 'restore' });
  await expectServer(
    context,
    HOSTING_ID,
    'restore',
    including([GMAIL.inbox, GMAIL.allMail], [GMAIL.trash]),
  );
  await runAction(page, { kind: 'goto', view: 'inbox' });
  await expectListed(context, 'Doručená pošta po obnovení', HOSTING, true);
  await screenshot('new-inbox-after-restore');
  const facts = await observer(context).thread(HOSTING, 'new-thread-after-restore');
  observed.restored = metaMessageCount(facts.meta);
  await closeThread(page);
};

export const runNewPhase = async (
  context: GmailScenarioContext,
  launchedAt: number,
): Promise<NewPhaseResult> => {
  await waitForInbox(context.page, SMALL_INBOX_THREADS.length);
  context.step(`new app lists the inbox ${String(Date.now() - launchedAt)} ms after launch`);
  await context.screenshot('new-inbox-after-launch');
  const merge = await waitForMergedThread(context, HOSTING, launchedAt);
  const snapshot = await takeSnapshot(context, 'new');
  const steps = stepRecorder(context);
  const observed: Observed = { hits: [], rows: [], opened: null, restored: null };
  await steps.attempt('search', () => search(context, observed));
  await steps.attempt('done-and-restore', () => doneAndRestore(context, observed));
  return {
    merge,
    snapshot,
    searchHits: observed.hits,
    searchRows: observed.rows,
    searchOpenedMessages: observed.opened,
    restoredMessages: observed.restored,
    failures: steps.failures,
  };
};
