import { randomUUID } from 'node:crypto';
import {
  type AccountRepository,
  type AiJobRepository,
  type CalendarEventRepository,
  PORT_TOKENS,
  type ThreadRepository,
  type StoredCalendarEvent,
} from '@relay/engine';
import { api } from '@relay/shared/api';
import {
  type AiJob,
  type AiJobInput,
  CalendarEventIdSchema,
  ThreadIdSchema,
  type UserId,
} from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServerMailToolsResolver } from '../../src/ai/mcp/server-mail-tools-resolver';
import { buildAccount, buildThread } from '../persistence/support/fixtures';
import { registerUser } from '../support/auth-flow';
import { callMcp, mcpToolCall, ToolCallResponseSchema } from '../support/mcp-client';
import { startTestApp, type TestApp } from '../support/test-app';

const THREAD_ID = ThreadIdSchema.parse('thr_calendar_mcp');
const STRANGER_THREAD_ID = ThreadIdSchema.parse('thr_calendar_stranger');

describe('calendar tools on the server MCP endpoint', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const seedEvent = async (userId: UserId): Promise<void> => {
    const account = await app.app
      .get<symbol, AccountRepository>(PORT_TOKENS.AccountRepository)
      .create(buildAccount(userId));
    const uid = `${randomUUID()}@partner.test`;
    const event: StoredCalendarEvent = {
      id: CalendarEventIdSchema.parse(`cev_${randomUUID().slice(0, 8)}`),
      userId,
      source: { kind: 'invite', accountId: account.id },
      uid,
      recurrenceId: null,
      sequence: 0,
      dtstamp: '2026-11-14T12:00:00.000Z',
      status: 'confirmed',
      summary: 'Plánovanie',
      location: 'Zasadačka',
      description: null,
      organizer: { name: 'Lucia', email: 'lucia@partner.test' },
      attendees: [{ name: null, email: account.email, partstat: 'needs-action', role: null }],
      allDay: false,
      startsAt: '2026-11-16T15:00:00.000Z',
      endsAt: '2026-11-16T15:30:00.000Z',
      recurring: false,
      rangeEndsAt: '2026-11-16T15:30:00.000Z',
      ics: [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Relay test//EN',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        'DTSTAMP:20261114T120000Z',
        'DTSTART:20261116T150000Z',
        'DTEND:20261116T153000Z',
        'SUMMARY:Plánovanie',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
      method: 'REQUEST',
      myPartstat: 'needs-action',
      myEmail: account.email,
      messageId: null,
      threadId: THREAD_ID,
      createdAt: '2026-11-14T12:00:00.000Z',
      updatedAt: '2026-11-14T12:00:00.000Z',
      revision: 0,
    };
    await app.app
      .get<symbol, CalendarEventRepository>(PORT_TOKENS.CalendarEventRepository)
      .upsert(event);
  };

  const seedThread = async (userId: UserId): Promise<void> => {
    const account = await app.app
      .get<symbol, AccountRepository>(PORT_TOKENS.AccountRepository)
      .create(buildAccount(userId));
    await app.app
      .get<symbol, ThreadRepository>(PORT_TOKENS.ThreadRepository)
      .upsert(buildThread(account.id, { id: STRANGER_THREAD_ID }));
  };

  const runningJob = async (input: AiJobInput, before?: (userId: UserId) => Promise<void>) => {
    const session = await registerUser(app.api, `cal-${randomUUID().slice(0, 8)}@relay.test`);
    await before?.(session.user.id);
    await app.api.ok(
      api.settings.update,
      { body: { ai: { location: 'server' } } },
      session.accessToken,
    );
    const job: AiJob = await app.api.ok(api.ai.createJob, { body: { input } }, session.accessToken);
    const now = app.clock.now();
    await app.app.get<symbol, AiJobRepository>(PORT_TOKENS.AiJobRepository).claim(job.id, {
      owner: 'server-a:1',
      now: now.toISOString(),
      leaseUntil: new Date(now.getTime() + 10 * 60_000).toISOString(),
    });
    const endpoint = await app.app.get(ServerMailToolsResolver).resolve(job, 'server-a:1');
    const token = (endpoint?.headers['Authorization'] ?? '').replace('Bearer ', '');
    return { userId: session.user.id, token, access: session.accessToken };
  };

  const callTool = async (token: string, name: string, args: Record<string, unknown>) => {
    const response = await callMcp(app.baseUrl, mcpToolCall(name, args), token);
    expect(response.status).toBe(200);
    const parsed = ToolCallResponseSchema.parse(await response.json());
    expect(parsed.result.isError ?? false, parsed.result.content[0]?.text).toBe(false);
    return JSON.parse(parsed.result.content[0]?.text ?? 'null') as unknown;
  };

  it('answers in the device time zone sent with a chat job', async () => {
    const run = await runningJob({
      kind: 'chatAnswer',
      question: 'Čo mám zajtra?',
      threadId: null,
      history: [],
      timeZone: 'America/New_York',
    });
    await seedEvent(run.userId);

    const upcoming = await callTool(run.token, 'list_events', {
      from: '2026-11-16T00:00:00.000Z',
      days: 1,
    });
    const linked = await callTool(run.token, 'get_thread_events', { threadId: THREAD_ID });

    expect(upcoming).toMatchObject({
      timeZone: 'America/New_York',
      events: [{ title: 'Plánovanie', start: '2026-11-16T10:00:00-05:00', threadId: THREAD_ID }],
    });
    expect(linked).toMatchObject({
      timeZone: 'America/New_York',
      events: [{ title: 'Plánovanie', myStatus: 'needs-action', end: '2026-11-16T10:30:00-05:00' }],
    });
  });

  it('falls back to UTC for read-only jobs and only shows the job owner events', async () => {
    const owner = await runningJob({
      kind: 'chatAnswer',
      question: 'Čo mám zajtra?',
      threadId: null,
      history: [],
    });
    await seedEvent(owner.userId);
    const stranger = await runningJob(
      { kind: 'summary', threadId: STRANGER_THREAD_ID, sourceMessageId: null },
      seedThread,
    );

    const own = await callTool(owner.token, 'list_events', {
      from: '2026-11-16T00:00:00.000Z',
      days: 1,
    });
    const foreign = await callTool(stranger.token, 'get_thread_events', { threadId: THREAD_ID });

    expect(own).toMatchObject({
      timeZone: 'UTC',
      events: [{ start: '2026-11-16T15:00:00+00:00' }],
    });
    expect(foreign).toMatchObject({ timeZone: 'UTC', events: [] });
  });

  it('rejects an unknown time zone when the job is created', async () => {
    const session = await registerUser(app.api, `cal-${randomUUID().slice(0, 8)}@relay.test`);
    const response = await fetch(`${app.baseUrl}/ai/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        input: {
          kind: 'chatAnswer',
          question: 'Čo mám zajtra?',
          threadId: null,
          history: [],
          timeZone: 'Mars/Olympus',
        },
      }),
    });

    expect(response.status).toBe(400);
  });
});
