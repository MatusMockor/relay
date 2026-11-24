import { runAction } from '../app/actions';
import { waitForInbox } from '../app/inbox';
import { openSidebarFolder } from '../app/sidebar';
import { CLIENT_LABEL } from '../gmail/gmail-layout';
import { GMAIL_SMALL_SUBJECTS, threadsPlaced } from '../gmail/gmail-small-inbox';
import { expectListed } from './gmail-expect';
import type { GmailScenarioContext } from './gmail-scenario';

export const ARCHIVED_SUBJECT = threadsPlaced('archived')[0] ?? '';

export const SMALL_INBOX_THREADS: readonly string[] = [
  ...threadsPlaced('inbox'),
  ...threadsPlaced('label'),
  ...threadsPlaced('self'),
];

export const waitForFullSync = async (context: GmailScenarioContext): Promise<void> => {
  await runAction(context.page, { kind: 'goto', view: 'archive' });
  await expectListed(context, 'Archív (All Mail synced)', ARCHIVED_SUBJECT, true);
  await openSidebarFolder(context.page, CLIENT_LABEL);
  await expectListed(
    context,
    `${CLIENT_LABEL} (label synced)`,
    GMAIL_SMALL_SUBJECTS.labelled,
    true,
  );
  await runAction(context.page, { kind: 'goto', view: 'inbox' });
  await waitForInbox(context.page, SMALL_INBOX_THREADS.length);
};
