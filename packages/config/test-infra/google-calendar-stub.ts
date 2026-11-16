import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type StubInput = Record<string, unknown> & { id: string };
export type StubEvent = StubInput & { etag: string };

export interface GoogleCalendarStub {
  readonly tokenUrl: string;
  readonly apiUrl: string;
  readonly requests: { method: string; path: string; ifMatch: string | null }[];
  readonly calendars: Record<string, unknown>[];
  put(calendarId: string, event: StubInput): StubEvent;
  event(calendarId: string, eventId: string): StubEvent | undefined;
  grantCode(code: string, scope: string): void;
  expireAccessTokens(): void;
  close(): Promise<void>;
}

export const GOOGLE_CALENDAR_STUB_SCOPES =
  'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const send = (response: ServerResponse, status: number, body?: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(body === undefined ? '' : JSON.stringify(body));
};

const idToken = (email: string): string =>
  ['e30', Buffer.from(JSON.stringify({ email })).toString('base64url'), 'sig'].join('.');

export const startGoogleCalendarStub = async (email: string): Promise<GoogleCalendarStub> => {
  const requests: GoogleCalendarStub['requests'] = [];
  const calendars: Record<string, unknown>[] = [];
  const events = new Map<string, Map<string, StubEvent>>();
  const log: { seq: number; calendarId: string; event: StubEvent }[] = [];
  let seq = 0;
  let accessToken = 'access-1';
  const codes = new Map<string, string>();
  const store = (calendarId: string) => {
    const existing = events.get(calendarId) ?? new Map<string, StubEvent>();
    events.set(calendarId, existing);
    return existing;
  };
  const put = (calendarId: string, event: StubInput): StubEvent => {
    seq += 1;
    const stored = { ...event, etag: `"v${String(seq)}"`, updated: new Date().toISOString() };
    store(calendarId).set(event.id, stored);
    log.push({ seq, calendarId, event: stored });
    return stored;
  };

  const token = (params: URLSearchParams, response: ServerResponse): void => {
    if (params.get('grant_type') === 'refresh_token') {
      accessToken = `access-${String(++seq)}`;
      send(response, 200, { access_token: accessToken, expires_in: 3600, token_type: 'Bearer' });
      return;
    }
    const scope = codes.get(params.get('code') ?? '');
    if (scope === undefined) {
      send(response, 400, { error: 'invalid_grant' });
      return;
    }
    send(response, 200, {
      access_token: accessToken,
      refresh_token: 'refresh-1',
      expires_in: 3600,
      token_type: 'Bearer',
      scope,
      id_token: idToken(email),
    });
  };

  const api = (request: IncomingMessage, url: URL, body: string, response: ServerResponse) => {
    const parts = url.pathname
      .replace(/^\/calendar\/v3\//, '')
      .split('/')
      .map(decodeURIComponent);
    const ifMatch =
      typeof request.headers['if-match'] === 'string' ? request.headers['if-match'] : null;
    requests.push({ method: request.method ?? 'GET', path: parts.join('/'), ifMatch });
    if (request.headers.authorization !== `Bearer ${accessToken}`) {
      send(response, 401, { error: { code: 401 } });
      return;
    }
    if (parts[0] === 'users') {
      send(response, 200, { items: calendars });
      return;
    }
    const calendarId = parts[1] ?? '';
    const eventId = parts[3];
    if (eventId === undefined && request.method === 'GET') {
      const since = url.searchParams.get('syncToken');
      const items =
        since === null
          ? [...store(calendarId).values()]
          : log
              .filter((entry) => entry.calendarId === calendarId && entry.seq > Number(since))
              .map((entry) => entry.event);
      send(response, 200, { items, nextSyncToken: String(seq) });
      return;
    }
    if (eventId === undefined) {
      const created = put(calendarId, {
        ...(JSON.parse(body) as object),
        id: `new${String(seq + 1)}`,
        iCalUID: `new${String(seq + 1)}@google.com`,
        organizer: { email, self: true },
      });
      send(response, 200, created);
      return;
    }
    const current = store(calendarId).get(eventId);
    if (current === undefined) {
      send(response, 410, { error: { code: 410 } });
      return;
    }
    if (request.method === 'GET') {
      send(response, 200, current);
      return;
    }
    if (ifMatch !== current.etag) {
      send(response, 412, { error: { code: 412 } });
      return;
    }
    if (request.method === 'DELETE') {
      store(calendarId).delete(eventId);
      seq += 1;
      log.push({ seq, calendarId, event: { id: eventId, etag: '', status: 'cancelled' } });
      send(response, 204);
      return;
    }
    send(response, 200, put(calendarId, { ...current, ...(JSON.parse(body) as object) }));
  };

  const server = createServer((request, response) => {
    void readBody(request).then((body) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/token') {
        token(new URLSearchParams(body), response);
        return;
      }
      api(request, url, body, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${String(port)}`;
  return {
    tokenUrl: `${base}/token`,
    apiUrl: `${base}/calendar/v3`,
    requests,
    calendars,
    put,
    event: (calendarId, eventId) => store(calendarId).get(eventId),
    grantCode: (code, scope) => {
      codes.set(code, scope);
    },
    expireAccessTokens: () => {
      accessToken = 'rotated-on-server';
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};
