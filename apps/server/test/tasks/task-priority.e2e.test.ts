import { randomUUID } from 'node:crypto';
import { TaskService } from '@relay/engine';
import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const email = (): string => `tasks-${randomUUID().slice(0, 8)}@relay.test`;

describe('task priorities over HTTP', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('changes the priority of a task and lists the tasks by priority', async () => {
    const session = await registerUser(app.api, email());
    const tasks = app.app.get(TaskService);
    const call = await tasks.createFromAi(session.user.id, {
      threadId: null,
      title: 'Zavolať Jane',
      aiWhat: null,
    });
    const outage = await tasks.createFromAi(session.user.id, {
      threadId: null,
      title: 'Opraviť výpadok',
      aiWhat: null,
      priority: 'high',
    });

    const updated = await app.api.ok(
      api.tasks.update,
      { params: { id: call.id }, body: { priority: 'urgent' } },
      session.accessToken,
    );
    const listed = await app.api.ok(api.tasks.list, { query: {} }, session.accessToken);

    expect(call.priority).toBe('none');
    expect(updated).toMatchObject({ id: call.id, priority: 'urgent', title: 'Zavolať Jane' });
    expect(listed.items.map((task) => [task.id, task.priority])).toEqual([
      [call.id, 'urgent'],
      [outage.id, 'high'],
    ]);
  });

  it('rejects an unknown priority and a task of another user', async () => {
    const session = await registerUser(app.api, email());
    const other = await registerUser(app.api, email());
    const task = await app.app.get(TaskService).createFromAi(session.user.id, {
      threadId: null,
      title: 'Poslať ponuku',
      aiWhat: null,
    });

    const invalid = await fetch(`${app.baseUrl}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ priority: 'asap' }),
    });
    const foreign = await app.api.fail(
      api.tasks.update,
      { params: { id: task.id }, body: { priority: 'low' } },
      other.accessToken,
    );

    expect(invalid.status).toBe(400);
    expect(foreign).toMatchObject({ status: 404, error: { code: 'not_found' } });
  });
});
