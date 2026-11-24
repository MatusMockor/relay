import type { Mailbox, MailboxId, Message } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { demoRoleOf, withPlacementMoved } from '../src/data/demo/demo-message-location';
import type { DemoState } from '../src/data/demo/demo-state';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { demoIds } from '../src/data/demo/seed/ids';
import { present } from './support/present';

const NOW = new Date(2026, 10, 19, 9, 41);
const EFA = demoIds.account('efa');
const LUNCH = demoIds.thread('c-lunch');
const INBOX = demoIds.mailbox('efa');
const ARCHIVE = demoIds.folder('efa', 'archive');
const TRASH = demoIds.folder('efa', 'trash');
const INVOICES = demoIds.folder('efa', 'faktury');

const lunchRecord = (state: DemoState) => present(state.threads.get(LUNCH));

const firstLunchMessage = (state: DemoState): Message => present(lunchRecord(state).messages[0]);

const placeOnlyIn = (state: DemoState, mailboxId: MailboxId): Message => {
  const record = lunchRecord(state);
  const message = firstLunchMessage(state);
  const placed = { ...message, placements: [{ mailboxId, uid: message.uid }] };
  record.messages = record.messages.map((item) => (item.id === message.id ? placed : item));
  return placed;
};

const totalsOf = (mailboxes: readonly Mailbox[]) =>
  new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.totalCount]));

describe('demo placements', () => {
  it('counts and lists a folder by placements, not by the mirrored mailbox', async () => {
    const baseline = totalsOf(await createDemoMailClient({ now: () => NOW }).listMailboxes(EFA));
    const state = buildDemoState(NOW);
    const placed = placeOnlyIn(state, INVOICES);
    const client = createDemoMailClient({ now: () => NOW, state });

    const totals = totalsOf(await client.listMailboxes(EFA));
    const page = await client.listThreads({ view: 'mailbox', mailboxId: INVOICES });

    expect(placed.mailboxId).not.toBe(INVOICES);
    expect(totals.get(INVOICES)).toBe((baseline.get(INVOICES) ?? 0) + 1);
    expect(totals.get(placed.mailboxId)).toBe((baseline.get(placed.mailboxId) ?? 0) - 1);
    expect(page.items.map((thread) => thread.id)).toContain(LUNCH);
  });

  it('moves one placement and mirrors the ranked primary placement', () => {
    const state = buildDemoState(NOW);
    const message = {
      ...firstLunchMessage(state),
      mailboxId: ARCHIVE,
      uid: 7,
      placements: [
        { mailboxId: ARCHIVE, uid: 7 },
        { mailboxId: INBOX, uid: 3 },
      ],
    };

    const moved = withPlacementMoved(message, INBOX, TRASH, demoRoleOf(state));

    expect(moved.placements).toEqual([
      { mailboxId: ARCHIVE, uid: 7 },
      { mailboxId: TRASH, uid: 3 },
    ]);
    expect({ mailboxId: moved.mailboxId, uid: moved.uid }).toEqual({ mailboxId: ARCHIVE, uid: 7 });
    expect(withPlacementMoved(message, ARCHIVE, INBOX, demoRoleOf(state)).placements).toEqual([
      { mailboxId: INBOX, uid: 3 },
    ]);
  });
});
