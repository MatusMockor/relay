import { randomUUID } from 'node:crypto';
import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { authenticateRealtime } from '../support/realtime-client';
import { startTestApp, type TestApp } from '../support/test-app';

describe('splits', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('replaces, lists and validates splits per user', async () => {
    const session = await registerUser(app.api, `splits-${randomUUID().slice(0, 8)}@relay.test`);
    const other = await registerUser(app.api, `splits-${randomUUID().slice(0, 8)}@relay.test`);
    const socket = await authenticateRealtime(app.baseUrl, session.accessToken);

    const saved = await app.api.ok(
      api.splits.replace,
      {
        body: {
          splits: [
            {
              accountId: null,
              name: 'Jira',
              order: 0,
              exclusive: true,
              hideTasks: true,
              rules: [{ type: 'jira', projectKeys: ['REL'] }],
            },
            {
              accountId: null,
              name: 'Faktúry',
              order: 1,
              exclusive: false,
              rules: [{ type: 'subjectRegex', pattern: 'fakt[uú]ra', caseSensitive: false }],
            },
          ],
        },
      },
      session.accessToken,
    );
    expect(saved.map((split) => [split.name, split.userId, split.hideTasks])).toEqual([
      ['Jira', session.user.id, true],
      ['Faktúry', session.user.id, false],
    ]);
    expect(await app.api.ok(api.splits.list, {}, session.accessToken)).toEqual(saved);
    expect(await app.api.ok(api.splits.list, {}, other.accessToken)).toEqual([]);
    await socket.waitFor(
      (message) => message.type === 'event' && message.event.type === 'splits.updated',
    );

    const invalid = await app.api.fail(
      api.splits.replace,
      {
        body: {
          splits: [
            {
              accountId: null,
              name: 'Broken',
              order: 0,
              exclusive: false,
              rules: [{ type: 'subjectRegex', pattern: '([', caseSensitive: false }],
            },
          ],
        },
      },
      session.accessToken,
    );
    expect(invalid).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
    socket.close();
  });
});
