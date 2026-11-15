import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { api, parseEndpointResponse } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };
import { createApp } from '../src/app.factory';

describe('GET /health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the server name, version and api version', async () => {
    const response = await app.inject({ method: 'GET', url: api.health.get.path });
    expect(response.statusCode).toBe(200);
    const parsed = parseEndpointResponse(api.health.get, response.json());
    expect(parsed).toEqual({
      success: true,
      data: { name: 'relay', version: packageJson.version, apiVersion: 1 },
    });
  });

  it('returns 404 for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
  });
});
