import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  api,
  buildUrl,
  type EndpointRequest,
  type EndpointResponse,
  parseEndpointRequest,
  parseEndpointResponse,
} from '../src/api';
import type { ThreadSummary } from '../src/domain';

describe('buildUrl', () => {
  it('fills path params and encodes query values, skipping empty ones', () => {
    const url = buildUrl('https://relay.example.com/', api.threads.list, {
      query: { view: 'inbox', q: 'faktúra & zmluva', limit: 20, cursor: undefined },
    });
    expect(url).toBe(
      'https://relay.example.com/threads?view=inbox&q=fakt%C3%BAra%20%26%20zmluva&limit=20',
    );
  });

  it('encodes path params', () => {
    const url = buildUrl('http://localhost:3000', api.threads.get, {
      params: { id: 'a/b' },
    });
    expect(url).toBe('http://localhost:3000/threads/a%2Fb');
  });
});

describe('parseEndpointRequest', () => {
  it('coerces query strings and applies defaults', () => {
    const result = parseEndpointRequest(api.threads.list, { query: { view: 'done' } });
    expect(result).toEqual({
      success: true,
      data: { params: undefined, query: { view: 'done', limit: 50 }, body: undefined },
    });
    const limited = parseEndpointRequest(api.tasks.list, { query: { limit: '10' } });
    expect(limited.success && limited.data.query.limit).toBe(10);
  });

  it('rejects an unknown thread action with a validation error', () => {
    const result = parseEndpointRequest(api.threads.action, {
      params: { id: 'thr_1' },
      body: { type: 'explode' },
    });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.code).toBe('validation_failed');
    expect(!result.success && result.error.issues?.[0]?.path).toBe('type');
  });

  it('requires a reminder time for the remind action', () => {
    const result = parseEndpointRequest(api.threads.action, {
      params: { id: 'thr_1' },
      body: { type: 'remind' },
    });
    expect(result.success).toBe(false);
  });
});

describe('parseEndpointResponse', () => {
  it('validates the health response', () => {
    const ok = parseEndpointResponse(api.health.get, {
      name: 'relay',
      version: '0.1.0',
      apiVersion: 1,
    });
    expect(ok.success).toBe(true);
    const wrong = parseEndpointResponse(api.health.get, { name: 'other' });
    expect(!wrong.success && wrong.error.code).toBe('internal');
  });
});

describe('endpoint typing', () => {
  it('infers request and response types from the schemas', () => {
    type GetThreadRequest = EndpointRequest<typeof api.threads.get>;
    expectTypeOf<GetThreadRequest['params']>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<GetThreadRequest['body']>().toEqualTypeOf<undefined>();
    expectTypeOf<EndpointResponse<typeof api.threads.action>>().toEqualTypeOf<ThreadSummary>();
  });
});

describe('url safety', () => {
  it('refuses dot segments and base urls with a query or fragment', () => {
    expect(() =>
      buildUrl('http://localhost:3000', api.threads.get, { params: { id: '..' } }),
    ).toThrow(/Invalid path parameter "id"/);
    expect(() => buildUrl('https://relay.example.com/?tenant=1', api.health.get, {})).toThrow(
      /must not contain a query or fragment/,
    );
  });
});
