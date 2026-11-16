// @vitest-environment jsdom
import './support/node-abort-globals';
import type { MailAccount, MessageId, ThreadSummary } from '@relay/shared/domain';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setUi } from '../../src/renderer/src/state/ui-store';
import { renderApp, resetStores } from '../../src/renderer/test/support/render-app';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
} from '../main/support/greenmail';
import { imapAccountBody } from '../main/support/seed-account';
import { type DesktopFixture, startDesktop } from './support/desktop-app';

const ZONE = 'Europe/Bratislava';
const DAY = { from: '2026-11-16T00:00:00+01:00', to: '2026-11-17T00:00:00+01:00', timeZone: ZONE };

const invite = (uid: string, summary: string, attendee: string): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Relay//Test//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20261115T080000Z',
    'DTSTART:20261116T090000Z',
    'DTEND:20261116T100000Z',
    'SEQUENCE:0',
    `SUMMARY:${summary}`,
    'ORGANIZER:mailto:peter@partner.test',
    `ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

describe('failed calendar invitations in local mode', () => {
  let desktop: DesktopFixture;
  let mailbox: GreenMailAccount;

  beforeEach(async () => {
    resetStores();
    desktop = await startDesktop();
    mailbox = await createGreenMailAccount();
  });

  afterEach(async () => {
    resetStores();
    await desktop.close();
    await mailbox.remove();
  });

  const expectOk = <T,>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
    expect(result).toMatchObject({ ok: true });
    return (result as { ok: true; data: T }).data;
  };

  const seedFailed = async (account: MailAccount, thread: ThreadSummary, summary: string) => {
    const { bridge, runtime } = desktop.harness;
    const detail = expectOk(await bridge.invoke('local.threads.get', { threadId: thread.id }));
    const messageId = detail.messages[0]?.id ?? ('' as MessageId);
    expect(messageId).not.toBe('');
    await runtime.engine.repositories.pendingWork.put({
      accountId: account.id,
      kind: 'calendar-invite',
      ref: messageId,
      createdAt: '2026-11-15T09:00:00.000Z',
      payload: {
        messageId,
        threadId: thread.id,
        mailboxRole: 'inbox',
        parts: [invite(`${summary}@partner.test`, summary, mailbox.email)],
        publish: true,
        attempts: 6,
        nextAttemptAt: null,
        failedAt: '2026-11-15T20:00:00.000Z',
        lastError: 'database is locked',
      },
    });
  };

  it('retries and dismisses invitations that failed six times from the calendar settings', async () => {
    const { bridge } = desktop.harness;
    for (const subject of ['Pozvánka: Retro', 'Pozvánka: Demo']) {
      await deliverMail(mailbox, { from: 'Peter <peter@partner.test>', subject, text: 'Príloha.' });
    }
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const { items } = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    for (const thread of items) {
      await seedFailed(account, thread, thread.subject.replace('Pozvánka: ', ''));
    }
    renderApp({ platform: desktop.platform });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'calendars', adding: false } });
    });

    const section = await screen.findByRole('region', { name: 'Nespracované pozvánky' });
    expect(await within(section).findByText('Pozvánka: Retro')).toBeTruthy();
    expect(
      within(section).getAllByText(/6 pokusov, naposledy .* · database is locked/),
    ).toHaveLength(2);
    const retro = within(section).getByText('Pozvánka: Retro').closest('.srow');
    expect(retro).not.toBeNull();
    act(() => {
      fireEvent.click(within(retro as HTMLElement).getByRole('button', { name: 'Skúsiť znova' }));
    });

    expect(await screen.findByText('Pozvánka pridaná do kalendára')).toBeTruthy();
    await waitFor(() => {
      expect(within(section).queryByText('Pozvánka: Retro')).toBeNull();
    });
    const { items: occurrences } = expectOk(await bridge.invoke('local.calendar.occurrences', DAY));
    expect(occurrences.map((occurrence) => occurrence.title)).toEqual(['Retro']);

    const demo = within(section).getByText('Pozvánka: Demo').closest('.srow');
    act(() => {
      fireEvent.click(within(demo as HTMLElement).getByRole('button', { name: 'Zahodiť' }));
    });

    expect(await screen.findByText('Pozvánka zahodená')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Nespracované pozvánky' })).toBeNull();
    });
    expect(expectOk(await bridge.invoke('local.calendar.failedInvitations.list'))).toEqual([]);
    expect(
      await desktop.harness.runtime.engine.repositories.pendingWork.list(
        account.id,
        'calendar-invite',
      ),
    ).toEqual([]);
  });
});
