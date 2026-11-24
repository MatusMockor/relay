import { describe, expect, it } from 'vitest';
import {
  ConnectTaskSystemInputSchema,
  ExternalTaskSchema,
  isTaskSystemProviderAvailable,
  TaskSystemConnectionSchema,
} from '../src/domain';

describe('task system schemas', () => {
  it('trims the Jira connect input and rejects unknown providers', () => {
    expect(
      ConnectTaskSystemInputSchema.parse({
        provider: 'jira',
        siteUrl: ' https://firma.atlassian.net ',
        email: ' ja@firma.sk ',
        apiToken: ' token ',
      }),
    ).toEqual({
      provider: 'jira',
      siteUrl: 'https://firma.atlassian.net',
      email: 'ja@firma.sk',
      apiToken: 'token',
    });
    expect(
      ConnectTaskSystemInputSchema.safeParse({ provider: 'linear', apiKey: 'x' }).success,
    ).toBe(false);
    expect(
      ConnectTaskSystemInputSchema.safeParse({
        provider: 'jira',
        siteUrl: 'https://firma.atlassian.net',
        email: 'not-an-email',
        apiToken: 'token',
      }).success,
    ).toBe(false);
  });

  it('never carries secrets in a connection', () => {
    const connection = TaskSystemConnectionSchema.parse({
      id: 'tsc_1',
      userId: 'usr_1',
      provider: 'jira',
      label: 'Acme Jira',
      siteUrl: 'https://acme.atlassian.net',
      accountName: 'Alice',
      status: 'ok',
      lastError: null,
      createdAt: '2026-11-15T10:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
      apiToken: 'secret',
    });
    expect(connection).not.toHaveProperty('apiToken');
  });

  it('accepts only calendar dates as due dates', () => {
    const task = {
      connectionId: 'tsc_1',
      provider: 'jira',
      externalId: '10001',
      key: 'ACME-1',
      title: 'Úloha',
      url: 'https://acme.atlassian.net/browse/ACME-1',
      status: { name: 'To Do', category: 'todo' },
      priority: 'none',
      projectName: null,
      dueDate: '2026-11-20',
      updatedAt: '2026-11-15T10:00:00.000Z',
    };
    expect(ExternalTaskSchema.safeParse(task).success).toBe(true);
    expect(ExternalTaskSchema.safeParse({ ...task, dueDate: '20.11.2026' }).success).toBe(false);
  });

  it('offers only Jira for now', () => {
    expect(isTaskSystemProviderAvailable('jira')).toBe(true);
    expect(isTaskSystemProviderAvailable('linear')).toBe(false);
    expect(isTaskSystemProviderAvailable('github')).toBe(false);
  });
});
