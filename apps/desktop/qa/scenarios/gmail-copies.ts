import assert from 'node:assert/strict';
import { runAction } from '../app/actions';
import { listedSubjects, waitForInbox } from '../app/inbox';
import { openSidebarFolder } from '../app/sidebar';
import { closeThread, openThread, threadFacts } from '../app/thread-view';
import { CLIENT_LABEL, GMAIL } from '../gmail/gmail-layout';
import { gmailSmallInbox, gmailSmallMessageId, threadsPlaced } from '../gmail/gmail-small-inbox';
import type { GmailScenarioContext } from './gmail-scenario';
import { exactly, expectListed, expectServer, including } from './gmail-expect';
import { addGmailAccount } from './gmail-onboard';
import { runGmailScenario } from './gmail-scenario';
import { stepRecorder } from './scenario-steps';

const HOSTING = 'Faktúra za hosting 11/2026';
const LABELLED = 'Ponuka pre klienta Alfa';
const SELF = 'Poznámka pre seba: prístupy k VPN';
const HOSTING_ID = gmailSmallMessageId(HOSTING);
const ARCHIVED = threadsPlaced('archived')[0] ?? '';

const inboxThreads = [
  ...threadsPlaced('inbox'),
  ...threadsPlaced('label'),
  ...threadsPlaced('self'),
];

const observer = (context: GmailScenarioContext) => ({
  list: async (label: string) => {
    const subjects = await listedSubjects(context.page);
    context.step(`${label} lists ${String(subjects.length)} rows: ${subjects.join(' | ')}`);
  },
  thread: async (subject: string, shot: string) => {
    await openThread(context.page, subject);
    const facts = await threadFacts(context.page);
    context.step(
      `thread "${facts.title}": meta "${facts.meta}", ${String(facts.messageElements)} message elements`,
    );
    await context.screenshot(shot);
  },
});

const waitForFullSync = async (context: GmailScenarioContext): Promise<void> => {
  await runAction(context.page, { kind: 'goto', view: 'archive' });
  await expectListed(context, 'Archív (All Mail synced)', ARCHIVED, true);
  await openSidebarFolder(context.page, CLIENT_LABEL);
  await expectListed(context, `${CLIENT_LABEL} (label synced)`, LABELLED, true);
  await runAction(context.page, { kind: 'goto', view: 'inbox' });
  await waitForInbox(context.page, inboxThreads.length);
};

await runGmailScenario({
  name: 'gmail-copies',
  seed: (gmail) => gmailSmallInbox(gmail.account.email),
  run: async (context) => {
    const { page, screenshot } = context;
    const look = observer(context);
    const steps = stepRecorder(context);
    await addGmailAccount(context);
    await waitForInbox(page, inboxThreads.length);
    await waitForFullSync(context);
    await look.list('inbox');
    await expectServer(context, HOSTING_ID, 'seeding', exactly(GMAIL.inbox, GMAIL.allMail));
    await screenshot('inbox');
    await steps.attempt('thread-detail', async () => {
      await look.thread(HOSTING, 'thread-inbox-and-all-mail');
      await closeThread(page);
      await look.thread(LABELLED, 'thread-labelled-three-messages');
      await closeThread(page);
      await look.thread(SELF, 'thread-sent-to-self');
      await closeThread(page);
    });
    await steps.attempt('archive', async () => {
      await openThread(page, HOSTING);
      await runAction(page, { kind: 'done' });
      await runAction(page, { kind: 'back' });
      await expectListed(context, 'Doručená pošta', HOSTING, false);
      await screenshot('inbox-after-done');
      await expectServer(context, HOSTING_ID, 'Hotovo', exactly(GMAIL.allMail));
      await runAction(page, { kind: 'goto', view: 'archive' });
      await look.list('Archív');
      await screenshot('archive-view');
      await runAction(page, { kind: 'goto', view: 'done' });
      await expectListed(context, 'Hotovo', HOSTING, true);
      await screenshot('done-view');
    });
    await steps.attempt('move-to-label', async () => {
      await openThread(page, HOSTING);
      await runAction(page, { kind: 'move', target: CLIENT_LABEL });
      await expectServer(
        context,
        HOSTING_ID,
        `move to ${CLIENT_LABEL}`,
        exactly(CLIENT_LABEL, GMAIL.allMail),
      );
      await openSidebarFolder(page, CLIENT_LABEL);
      await expectListed(context, CLIENT_LABEL, HOSTING, true);
      await look.list(CLIENT_LABEL);
      await screenshot('label-view');
    });
    await steps.attempt('trash-and-restore', async () => {
      await openThread(page, HOSTING);
      await runAction(page, { kind: 'trash' });
      await expectServer(context, HOSTING_ID, 'trash', exactly(GMAIL.trash));
      await runAction(page, { kind: 'goto', view: 'trash' });
      await expectListed(context, 'Kôš', HOSTING, true);
      await screenshot('trash-view');
      await openThread(page, HOSTING);
      await runAction(page, { kind: 'restore' });
      await expectServer(
        context,
        HOSTING_ID,
        'restore',
        including([GMAIL.allMail], [GMAIL.trash, GMAIL.inbox]),
      );
      await runAction(page, { kind: 'goto', view: 'inbox' });
      await expectListed(context, 'Doručená pošta po obnovení', HOSTING, false);
      await screenshot('inbox-after-restore');
    });
    await steps.attempt('search', async () => {
      await runAction(page, { kind: 'search', query: 'hosting' });
      await expectListed(context, 'Výsledky hľadania', HOSTING, true);
      await look.list('search "hosting"');
      await screenshot('search-results');
      await look.thread(HOSTING, 'search-opened-thread');
    });
    assert.deepEqual(steps.failures, [], `Failed steps:\n${steps.failures.join('\n')}`);
  },
});
