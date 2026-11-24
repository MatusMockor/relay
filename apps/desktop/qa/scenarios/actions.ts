import assert from 'node:assert/strict';
import { runAction } from '../app/actions';
import { waitForThreadGone, waitForThreadRow } from '../app/inbox';
import { openThread } from '../app/thread-view';
import { eventually } from '../greenmail/eventually';
import { threadSubjectsIn } from '../greenmail/mailbox-contents';
import { smallInbox } from '../seed/small-inbox';
import { onboardGreenMail } from './onboard';
import { runScenario } from './scenario-context';

const DONE = 'Faktúra č. 2026-118';
const MOVED = 'Obed v piatok?';
const TRASHED = 'Týždenný report';
const PALETTE_MOVED = 'Dovolenka v decembri';
const PROJECTS = 'Projekty';

await runScenario({
  name: 'actions',
  seed: (user) => ({
    ...smallInbox(user.email),
    mailboxes: ['INBOX', 'Archive', 'Trash', PROJECTS],
  }),
  run: async (context) => {
    const { page, screenshot, step } = context;
    await onboardGreenMail(context, 12);
    await screenshot('inbox');

    step('done (E) and restore from Hotovo');
    await openThread(page, DONE);
    await runAction(page, { kind: 'done' });
    await runAction(page, { kind: 'back' });
    await waitForThreadGone(page, DONE);
    await screenshot('after-done');
    await runAction(page, { kind: 'goto', view: 'done' });
    await waitForThreadRow(page, DONE);
    await screenshot('done-view');
    await openThread(page, DONE);
    await runAction(page, { kind: 'restore' });
    await runAction(page, { kind: 'goto', view: 'inbox' });
    await waitForThreadRow(page, DONE);
    await screenshot('restored-from-done');

    step('move (V) to a folder');
    await openThread(page, MOVED);
    await runAction(page, { kind: 'move', target: PROJECTS });
    await runAction(page, { kind: 'goto', view: 'inbox' });
    await waitForThreadGone(page, MOVED);
    await screenshot('after-move');

    step('move through the command palette');
    await openThread(page, PALETTE_MOVED);
    await runAction(page, { kind: 'moveViaPalette', target: PROJECTS });
    await runAction(page, { kind: 'goto', view: 'inbox' });
    await waitForThreadGone(page, PALETTE_MOVED);
    const moved = [PALETTE_MOVED, MOVED].sort();
    const inProjects = await eventually(
      () => threadSubjectsIn(context.user, PROJECTS),
      (subjects) => subjects.join() === moved.join(),
    );
    assert.deepEqual(inProjects, moved);

    step('trash (#), undo (Z), trash again and restore from Kôš');
    await openThread(page, TRASHED);
    await runAction(page, { kind: 'trash' });
    await runAction(page, { kind: 'goto', view: 'inbox' });
    await waitForThreadGone(page, TRASHED);
    await runAction(page, { kind: 'undo' });
    await waitForThreadRow(page, TRASHED);
    await screenshot('after-undo');
    await openThread(page, TRASHED);
    await runAction(page, { kind: 'trash' });
    await runAction(page, { kind: 'goto', view: 'trash' });
    await waitForThreadRow(page, TRASHED);
    await screenshot('trash-view');
    await openThread(page, TRASHED);
    await runAction(page, { kind: 'restore' });
    await runAction(page, { kind: 'goto', view: 'inbox' });
    await waitForThreadRow(page, TRASHED);
    await screenshot('restored-from-trash');
    const inbox = await eventually(
      () => threadSubjectsIn(context.user, 'INBOX'),
      (subjects) => subjects.includes(TRASHED),
    );
    assert.ok(inbox.includes(TRASHED), `${TRASHED} is back in the IMAP INBOX`);

    step('search (/)');
    await runAction(page, { kind: 'search', query: 'cenník' });
    await waitForThreadRow(page, 'Nová verzia cenníka');
    await screenshot('search-results');
  },
});
