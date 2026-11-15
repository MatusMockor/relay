import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };
import { startTestApp, type TestApp } from './support/test-app';

describe('GET /health', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the server name, version and api version without auth', async () => {
    const health = await app.api.ok(api.health.get, {});
    expect(health).toEqual({ name: 'relay', version: packageJson.version, apiVersion: 1 });
  });

  it('returns the shared error shape for unknown routes', async () => {
    const response = await fetch(`${app.baseUrl}/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
