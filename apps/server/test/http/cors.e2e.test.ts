import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../support/test-app';

describe('CORS', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers a desktop renderer preflight for an authorized request', async () => {
    const response = await fetch(`${app.baseUrl}/threads`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.status).toBeLessThan(300);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('allows the file origin that a packaged Electron renderer sends', async () => {
    const response = await fetch(`${app.baseUrl}/health`, { headers: { origin: 'null' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('null');
  });
});
