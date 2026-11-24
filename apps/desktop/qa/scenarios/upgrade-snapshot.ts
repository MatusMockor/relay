import { runAction } from '../app/actions';
import { waitForInbox } from '../app/inbox';
import { openSidebarFolder } from '../app/sidebar';
import { closeThread, metaMessageCount } from '../app/thread-view';
import { CLIENT_LABEL } from '../gmail/gmail-layout';
import { GMAIL_SMALL_SUBJECTS } from '../gmail/gmail-small-inbox';
import { expectListed } from './gmail-expect';
import { observer } from './gmail-observer';
import type { GmailScenarioContext } from './gmail-scenario';
import { ARCHIVED_SUBJECT, SMALL_INBOX_THREADS } from './gmail-small-sync';

export interface UpgradeSnapshot {
  readonly inbox: readonly string[];
  readonly archive: readonly string[];
  readonly label: readonly string[];
  readonly hostingMessages: number | null;
  readonly labelledMessages: number | null;
}

export type Phase = 'old' | 'new';

const threadMessages = async (
  context: GmailScenarioContext,
  subject: string,
  shot: string,
): Promise<number | null> => {
  const facts = await observer(context).thread(subject, shot);
  await closeThread(context.page);
  return metaMessageCount(facts.meta);
};

const listOf = async (context: GmailScenarioContext, view: string, shot: string) => {
  const subjects = await observer(context).list(view);
  await context.screenshot(shot);
  return [...subjects].sort();
};

export const takeSnapshot = async (
  context: GmailScenarioContext,
  phase: Phase,
): Promise<UpgradeSnapshot> => {
  const { page } = context;
  await runAction(page, { kind: 'goto', view: 'inbox' });
  await waitForInbox(page, SMALL_INBOX_THREADS.length);
  const inbox = await listOf(context, `${phase} inbox`, `${phase}-inbox`);
  const hostingMessages = await threadMessages(
    context,
    GMAIL_SMALL_SUBJECTS.hosting,
    `${phase}-thread-inbox-and-all-mail`,
  );
  const labelledMessages = await threadMessages(
    context,
    GMAIL_SMALL_SUBJECTS.labelled,
    `${phase}-thread-labelled-three-messages`,
  );
  await runAction(page, { kind: 'goto', view: 'archive' });
  await expectListed(context, `${phase} Archív`, ARCHIVED_SUBJECT, true);
  const archive = await listOf(context, `${phase} Archív`, `${phase}-archive`);
  await openSidebarFolder(page, CLIENT_LABEL);
  await expectListed(context, `${phase} ${CLIENT_LABEL}`, GMAIL_SMALL_SUBJECTS.labelled, true);
  const label = await listOf(context, `${phase} ${CLIENT_LABEL}`, `${phase}-label`);
  await runAction(page, { kind: 'goto', view: 'inbox' });
  return { inbox, archive, label, hostingMessages, labelledMessages };
};
