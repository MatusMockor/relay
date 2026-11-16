import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UserIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MailToolSocketHost } from '../src/socket/mail-tool-socket-host';
import { SocketMailToolBackend } from '../src/socket/socket-mail-tool-backend';
import { invitation, occurrence, USER_A, USER_B } from './support/fixtures';
import { InMemoryMail } from './support/in-memory-mail';
import { backendFor, callJson, connectInMemory, type ConnectedClient } from './support/mcp-client';

const RANGE = { from: '2026-11-16T00:00:00.000Z', days: 2 };

describe('calendar MCP tools', () => {
  let mail: InMemoryMail;
  let connected: ConnectedClient;

  beforeEach(async () => {
    mail = new InMemoryMail();
    mail.occurrences.push(
      { userId: UserIdSchema.parse(USER_A), occurrence: occurrence('a') },
      {
        userId: UserIdSchema.parse(USER_A),
        occurrence: occurrence('holiday', {
          allDay: true,
          start: '2026-11-16T23:00:00.000Z',
          end: '2026-11-17T23:00:00.000Z',
        }),
      },
      {
        userId: UserIdSchema.parse(USER_A),
        occurrence: occurrence('late', {
          start: '2026-11-20T09:00:00.000Z',
          end: '2026-11-20T10:00:00.000Z',
        }),
      },
      { userId: UserIdSchema.parse(USER_B), occurrence: occurrence('other') },
    );
    mail.invitations.push(
      { userId: UserIdSchema.parse(USER_A), invitation: invitation('a') },
      { userId: UserIdSchema.parse(USER_B), invitation: invitation('b') },
    );
    connected = await connectInMemory(backendFor(mail, USER_A));
  });

  afterEach(async () => {
    await connected.close();
  });

  it('lists the events of the range in the explicit time zone', async () => {
    const result = await callJson(connected.client, 'list_events', RANGE);

    expect(mail.calendarRequests).toEqual([
      {
        range: { from: '2026-11-16T00:00:00.000Z', to: '2026-11-18T00:00:00.000Z', limit: 50 },
        timeZone: 'Europe/Bratislava',
      },
    ]);
    expect(result).toMatchObject({
      notice: expect.stringContaining('untrusted') as unknown,
      timeZone: 'Europe/Bratislava',
      events: [
        {
          title: 'Stretnutie a',
          allDay: false,
          start: '2026-11-16T10:00:00+01:00',
          end: '2026-11-16T11:00:00+01:00',
          myStatus: 'needs-action',
          organizer: 'Peter Kráľ <peter@partner.test>',
          threadId: 'thr_1',
        },
        { title: 'Stretnutie holiday', allDay: true, start: '2026-11-17', end: '2026-11-18' },
      ],
    });
  });

  it('returns the events linked to a thread with attendees and conflicts', async () => {
    const result = await callJson(connected.client, 'get_thread_events', { threadId: 'thr_1' });

    expect(result).toMatchObject({
      timeZone: 'Europe/Bratislava',
      events: [
        {
          eventId: 'cev_a',
          start: '2026-11-16T10:00:00+01:00',
          attendees: [
            { attendee: 'Peter Kráľ <peter@partner.test>', status: 'accepted' },
            { attendee: 'me@example.com', status: 'needs-action' },
          ],
          conflicts: [{ title: 'Obed', start: '2026-11-16T10:30:00+01:00' }],
        },
      ],
    });
    expect((result as { events: unknown[] }).events).toHaveLength(1);
  });

  it('marks both tools read-only', async () => {
    const { tools } = await connected.client.listTools();
    const calendar = tools.filter(
      (tool) => tool.name === 'list_events' || tool.name === 'get_thread_events',
    );

    expect(calendar).toHaveLength(2);
    expect(calendar.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });
});

describe('calendar tools over the local socket', () => {
  it('uses the time zone of the host that owns the data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'relay-mcp-cal-'));
    const mail = new InMemoryMail();
    mail.occurrences.push({ userId: UserIdSchema.parse(USER_A), occurrence: occurrence('a') });
    const host = new MailToolSocketHost({
      path: join(dir, 'mail.sock'),
      token: 'secret',
      backend: backendFor(mail, USER_A, 'America/New_York'),
    });
    await host.listen();
    const remote = await SocketMailToolBackend.connect(join(dir, 'mail.sock'), 'secret');
    const connected = await connectInMemory(remote);

    const result = await callJson(connected.client, 'list_events', RANGE);

    expect(result).toMatchObject({
      timeZone: 'America/New_York',
      events: [{ start: '2026-11-16T04:00:00-05:00' }],
    });
    await connected.close();
    remote.close();
    await host.close();
    await rm(dir, { recursive: true, force: true });
  });
});
