import { describe, expect, it } from 'vitest';
import { listEndpoints } from '../src/api';

const pathParams = (path: string): string[] =>
  [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1] ?? '');

const schemaKeys = (schema: unknown): string[] => {
  if (typeof schema !== 'object' || schema === null || !('shape' in schema)) {
    return [];
  }
  return Object.keys(schema.shape as Record<string, unknown>).sort();
};

describe('api contract', () => {
  const endpoints = listEndpoints();

  it('declares every endpoint the clients rely on', () => {
    const routes = endpoints.map(({ endpoint }) => `${endpoint.method} ${endpoint.path}`);
    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /health',
        'POST /auth/register',
        'POST /auth/login',
        'POST /auth/refresh',
        'POST /auth/logout',
        'GET /me',
        'GET /devices',
        'DELETE /devices/:id',
        'GET /accounts',
        'POST /accounts',
        'PATCH /accounts/:id',
        'PUT /accounts/order',
        'DELETE /accounts/:id',
        'POST /accounts/test-connection',
        'GET /accounts/:id/mailboxes',
        'GET /oauth/google/start',
        'GET /oauth/google/callback',
        'GET /threads',
        'GET /threads/:id',
        'POST /threads/:id/actions',
        'PATCH /threads/:id/checklist',
        'POST /drafts',
        'PATCH /drafts/:id',
        'DELETE /drafts/:id',
        'POST /send',
        'GET /attachments/:id/content',
        'POST /drafts/:id/attachments',
        'DELETE /drafts/:id/attachments/:attachmentId',
        'POST /drafts/:id/forwarded-attachments',
        'DELETE /scheduled/:id',
        'GET /tasks',
        'PATCH /tasks/:id',
        'GET /splits',
        'PUT /splits',
        'GET /settings',
        'PATCH /settings',
        'POST /ai/jobs',
        'GET /ai/jobs/:id',
        'GET /ai/runners',
        'POST /sync',
      ]),
    );
  });

  it('has unique method and path pairs', () => {
    const routes = endpoints.map(({ endpoint }) => `${endpoint.method} ${endpoint.path}`);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('declares a params schema exactly matching the path parameters', () => {
    endpoints.forEach(({ area, name, endpoint }) => {
      expect({ endpoint: `${area}.${name}`, keys: schemaKeys(endpoint.params) }).toEqual({
        endpoint: `${area}.${name}`,
        keys: pathParams(endpoint.path).sort(),
      });
    });
  });

  it('never declares a body on GET or DELETE endpoints', () => {
    const offenders = endpoints.filter(
      ({ endpoint }) =>
        (endpoint.method === 'GET' || endpoint.method === 'DELETE') && endpoint.body !== undefined,
    );
    expect(offenders).toEqual([]);
  });

  it('keeps only health, register, login, refresh and the oauth callback public', () => {
    const publicRoutes = endpoints
      .filter(({ endpoint }) => endpoint.auth === 'public')
      .map(({ endpoint }) => endpoint.path)
      .sort();
    expect(publicRoutes).toEqual([
      '/auth/login',
      '/auth/refresh',
      '/auth/register',
      '/health',
      '/oauth/google/callback',
    ]);
  });
});
