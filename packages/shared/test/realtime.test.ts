import { describe, expect, it } from 'vitest';
import { ClientMessageSchema, REALTIME_EVENT_TYPES, ServerMessageSchema } from '../src/realtime';

describe('realtime protocol', () => {
  it('lists every server event type', () => {
    expect([...REALTIME_EVENT_TYPES].sort()).toEqual([
      'account.removed',
      'account.status',
      'account.upserted',
      'ai.job.updated',
      'automation.notified',
      'automations.updated',
      'calendar.updated',
      'draft.removed',
      'draft.upserted',
      'labels.updated',
      'mailboxes.updated',
      'message.upserted',
      'scheduledSend.upserted',
      'settings.updated',
      'splits.updated',
      'sync.progress',
      'task.upserted',
      'thread.removed',
      'thread.upserted',
      'threads.changed',
    ]);
  });

  it('parses an event envelope sent by the server', () => {
    const message = ServerMessageSchema.parse({
      type: 'event',
      event: {
        type: 'account.status',
        at: '2026-11-15T10:00:00.000Z',
        data: { accountId: 'acc_1', status: 'syncing', lastSyncedAt: null, error: null },
      },
    });
    expect(message.type === 'event' && message.event.type).toBe('account.status');
  });

  it('requires the client hello to carry the api version and a token', () => {
    expect(
      ClientMessageSchema.safeParse({ type: 'hello', apiVersion: 1, accessToken: 'jwt' }).success,
    ).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: 'hello', apiVersion: 2 }).success).toBe(false);
  });
});
