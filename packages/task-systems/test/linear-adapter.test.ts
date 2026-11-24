import { type LinearStub, linearStubIssue, startLinearStub } from '@relay/config/test-infra';
import { ProviderError, ReauthorizationRequiredError, ValidationError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LINEAR_ALICE, linearAccess, linearAdapterFor } from './support/linear';

describe('LinearAdapter against a Linear GraphQL stub', () => {
  let stub: LinearStub;

  beforeEach(async () => {
    stub = await startLinearStub();
    stub.users.push(LINEAR_ALICE);
  });

  afterEach(async () => {
    await stub.close();
  });

  it('verifies the personal API key without a Bearer prefix', async () => {
    const account = await linearAdapterFor(stub).verify(linearAccess());

    expect(account).toEqual({
      siteUrl: 'https://linear.app/acme',
      externalAccountId: LINEAR_ALICE.id,
      accountName: LINEAR_ALICE.name,
      defaultLabel: 'Acme',
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]?.authorization).toBe(LINEAR_ALICE.apiKey);
    expect(stub.requests[0]?.query).toContain('organization { name urlKey }');
  });

  it('treats a rejected key as an auth failure', async () => {
    const adapter = linearAdapterFor(stub);

    await expect(adapter.verify(linearAccess('wrong'))).rejects.toThrow(
      ReauthorizationRequiredError,
    );
    await expect(adapter.listMyOpenTasks(linearAccess('wrong'))).rejects.toThrow(
      ReauthorizationRequiredError,
    );
    stub.failNext({ status: 401, body: 'Unauthorized' });
    await expect(adapter.verify(linearAccess())).rejects.toThrow(ReauthorizationRequiredError);
    stub.failNext({
      status: 200,
      body: { errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }] },
    });
    await expect(adapter.verify(linearAccess())).rejects.toThrow(ReauthorizationRequiredError);
  });

  it('pages through my open issues with the cursor and maps them', async () => {
    stub.pageSize = 2;
    stub.issue(
      LINEAR_ALICE.id,
      linearStubIssue('ENG-1', {
        title: 'Opraviť synchronizáciu',
        priority: 1,
        state: { name: 'In Progress', type: 'started' },
        project: { name: 'Mobilná aplikácia' },
        dueDate: '2026-11-20',
        updatedAt: '2026-11-14T09:30:00.000Z',
      }),
    );
    stub.issue(LINEAR_ALICE.id, linearStubIssue('ENG-2', { priority: 4 }));
    stub.issue(LINEAR_ALICE.id, linearStubIssue('ENG-3', { priority: 0, dueDate: 'soon' }));
    stub.issue('someone-else', linearStubIssue('ENG-4'));

    const result = await linearAdapterFor(stub).listMyOpenTasks(linearAccess());

    expect(result.truncated).toBe(false);
    expect(result.tasks.map((task) => [task.key, task.priority])).toEqual([
      ['ENG-1', 'urgent'],
      ['ENG-2', 'low'],
      ['ENG-3', 'none'],
    ]);
    expect(result.tasks[0]).toEqual({
      externalId: 'issue-eng-1',
      key: 'ENG-1',
      title: 'Opraviť synchronizáciu',
      url: 'https://linear.app/acme/issue/eng-1',
      status: { name: 'In Progress', category: 'inProgress' },
      priority: 'urgent',
      projectName: 'Mobilná aplikácia',
      dueDate: '2026-11-20',
      updatedAt: '2026-11-14T09:30:00.000Z',
    });
    expect(result.tasks[1]).toMatchObject({
      status: { name: 'Todo', category: 'todo' },
      projectName: 'Engineering',
    });
    expect(result.tasks[2]?.dueDate).toBeNull();
    const searches = stub.requests.filter((request) => request.query.includes('assignedIssues'));
    expect(searches.map((request) => request.variables)).toEqual([
      { first: 100, after: null },
      { first: 100, after: 'cursor-2' },
    ]);
    expect(searches[0]?.query).toContain(
      'filter: { state: { type: { nin: ["completed", "canceled"] } } }',
    );
    expect(searches[0]?.query).toContain('orderBy: updatedAt');
  });

  it('stops at the issue cap and reports the list as truncated', async () => {
    stub.pageSize = 2;
    for (const index of [1, 2, 3, 4, 5]) {
      stub.issue(LINEAR_ALICE.id, linearStubIssue(`ENG-${String(index)}`));
    }

    const result = await linearAdapterFor(stub, 3).listMyOpenTasks(linearAccess());

    expect(result.tasks.map((task) => task.key)).toEqual(['ENG-1', 'ENG-2', 'ENG-3']);
    expect(result.truncated).toBe(true);
    expect(stub.requests.at(-1)?.variables).toEqual({ first: 1, after: 'cursor-2' });
  });

  it('fails on invalid responses and other GraphQL errors', async () => {
    const adapter = linearAdapterFor(stub);
    stub.failNext({ status: 200, body: { data: { viewer: { assignedIssues: { nodes: [{}] } } } } });
    await expect(adapter.listMyOpenTasks(linearAccess())).rejects.toThrow(
      'Linear vrátil neplatnú odpoveď.',
    );
    stub.failNext({ status: 200, body: 'not json' });
    await expect(adapter.verify(linearAccess())).rejects.toThrow(ProviderError);
    stub.failNext({
      status: 400,
      body: { errors: [{ message: 'Too many', extensions: { code: 'RATELIMITED' } }] },
    });
    await expect(adapter.verify(linearAccess())).rejects.toThrow(/obmedzil počet požiadaviek/);
    stub.failNext({ status: 200, body: { errors: [{ message: 'Field "x" not found' }] } });
    await expect(adapter.verify(linearAccess())).rejects.toThrow('Linear požiadavku odmietol.');
    stub.failNext({ status: 502, body: 'Bad gateway' });
    await expect(adapter.verify(linearAccess())).rejects.toThrow('Linear vrátil stav 502.');
  });

  it('refuses credentials of another provider before calling Linear', async () => {
    const access = {
      siteUrl: 'https://linear.app',
      credentials: { provider: 'github', token: 'ghp_1' },
    } as const;

    await expect(linearAdapterFor(stub).verify(access)).rejects.toThrow(ValidationError);
    expect(stub.requests).toEqual([]);
  });

  it('reports an unreachable API as a provider error', async () => {
    const adapter = linearAdapterFor(stub);
    await stub.close();

    await expect(adapter.verify(linearAccess())).rejects.toThrow(ProviderError);
    stub = await startLinearStub();
  });
});
