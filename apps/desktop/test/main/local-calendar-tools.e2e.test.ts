import { SocketMailToolBackend } from '@relay/mcp-mail';
import { ThreadIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deviceTimeZone } from '../../src/main/ai/device-time-zone';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  subjectsIn,
} from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const invite = (organizer: string, attendee: string): string =>
  [
    'BEGIN:VCALENDAR',
    'METHOD:REQUEST',
    'PRODID:-//Relay test//EN',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `ORGANIZER;CN=Lucia:mailto:${organizer}`,
    `ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}`,
    'UID:relay-tools-1@partner.test',
    'SUMMARY:Plánovanie',
    'DTSTART:20261116T150000Z',
    'DTEND:20261116T153000Z',
    'DTSTAMP:20261114T120000Z',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

describe('local calendar AI tools and RSVP sent copy (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let me: GreenMailAccount;
  let organizer: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    me = await createGreenMailAccount();
    organizer = await createGreenMailAccount();
    harness = startLocalRuntime(dir, { withMailTools: true });
    await harness.runtime.start();
    await deliverMail(me, {
      from: `Lucia <${organizer.email}>`,
      subject: 'Pozvánka: Plánovanie',
      text: 'Prídeš?',
      attachments: [
        {
          filename: 'invite.ics',
          contentType: 'text/calendar; method=REQUEST',
          content: Buffer.from(invite(organizer.email, me.email)),
        },
      ],
    });
  });

  afterEach(async () => {
    await harness.close();
    await me.remove();
    await organizer.remove();
    await dir.remove();
  });

  const syncInvite = async () => {
    const account = expectOk(
      await harness.bridge.invoke('local.accounts.create', imapAccountBody(me)),
    );
    expectOk(await harness.bridge.invoke('local.sync.now', { accountId: account.id }));
    return account;
  };

  it('serves upcoming events and thread events to the MCP entry in the device time zone', async () => {
    await syncInvite();
    const endpoint = harness.runtime.mailToolsEndpoint;
    const socketPath = endpoint?.args[endpoint.args.indexOf('--socket') + 1] ?? '';
    const client = await SocketMailToolBackend.connect(
      socketPath,
      endpoint?.env.RELAY_MAIL_MCP_TOKEN ?? '',
    );

    const upcoming = await client.listEvents({
      from: '2026-11-16T00:00:00.000Z',
      to: '2026-11-17T00:00:00.000Z',
      limit: 10,
    });
    const threadId = ThreadIdSchema.parse(upcoming.occurrences[0]?.threadId);
    const linked = await client.getThreadEvents(threadId);
    client.close();

    expect(upcoming.timeZone).toBe(deviceTimeZone());
    expect(upcoming.occurrences).toEqual([
      expect.objectContaining({ title: 'Plánovanie', start: '2026-11-16T15:00:00.000Z' }),
    ]);
    expect(linked.timeZone).toBe(deviceTimeZone());
    expect(linked.invitations).toEqual([
      expect.objectContaining({ title: 'Plánovanie', myStatus: 'needs-action', canRespond: true }),
    ]);
  });

  it('saves the RSVP reply to the Sent mailbox', async () => {
    await syncInvite();
    const { items } = expectOk(
      await harness.bridge.invoke('local.calendar.occurrences', {
        from: '2026-11-16T00:00:00.000Z',
        to: '2026-11-17T00:00:00.000Z',
        timeZone: 'Europe/Bratislava',
      }),
    );

    const rsvp = await harness.bridge.invoke('local.calendar.rsvp', {
      eventId: items[0]?.eventId ?? '',
      response: 'accepted',
      timeZone: 'Europe/Bratislava',
    });
    expectOk(rsvp);

    await expect
      .poll(() => subjectsIn(organizer, 'INBOX'), { timeout: 10_000 })
      .toEqual(['Prijaté: Plánovanie']);
    expect(await subjectsIn(me, 'Sent')).toEqual(['Prijaté: Plánovanie']);
  });
});
