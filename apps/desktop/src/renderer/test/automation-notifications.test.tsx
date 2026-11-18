// @vitest-environment jsdom
import type { RealtimeEvent } from '@relay/shared';
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServicesProvider } from '../src/data/hooks/services-context';
import {
  type AutomationNotificationSink,
  NOTIFICATION_FAILED_MESSAGE,
  useRemoteAutomationNotifications,
} from '../src/data/hooks/use-remote-automation-notifications';
import { resetToasts, useToastStore } from '../src/state/toast-store';
import type { MailClient } from '../src/data/MailClient';
import type { AppServices } from '../src/session/services';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (check: () => boolean): Promise<void> => {
  const started = Date.now();
  while (!check() && Date.now() - started < 3_000) {
    await pause(10);
  }
  expect(check()).toBe(true);
};

const notified = (body: string): RealtimeEvent => ({
  type: 'automation.notified',
  at: '2026-11-17T10:00:00.000Z',
  data: {
    automationId: 'automation-1' as never,
    automationName: 'Od Tibora',
    threadId: 'thread-1' as never,
    title: 'Tibor Hrasko',
    body,
  },
});

const recordingSink = (): AutomationNotificationSink & { shown: string[] } => {
  const shown: string[] = [];
  return {
    shown,
    showNotification: ({ title, body, threadId }) => {
      shown.push(`${title}: ${body} (${threadId ?? 'bez vlákna'})`);
      return Promise.resolve();
    },
  };
};

const failingSink = (): AutomationNotificationSink & { attempts: number } => {
  const sink = {
    attempts: 0,
    showNotification: () => {
      sink.attempts += 1;
      return Promise.reject(new Error('IPC odmietlo notifikáciu'));
    },
  };
  return sink;
};

const render = (services: AppServices, sink: AutomationNotificationSink) =>
  renderHook(
    () => {
      useRemoteAutomationNotifications(sink);
    },
    {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <ServicesProvider services={services}>{children}</ServicesProvider>
      ),
    },
  );

describe('automation notifications in synced mode', () => {
  let server: ContractServer;
  let client: MailClient;

  beforeEach(async () => {
    server = await startContractServer();
    server.onSocketMessage((socket, text) => {
      if ((JSON.parse(text) as { type: string }).type === 'hello') {
        socket.send(JSON.stringify({ type: 'welcome', userId: 'user-1', deviceId: 'device-1' }));
      }
    });
    const store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
    client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
      reconnectDelayMs: 20,
    });
  });

  afterEach(async () => {
    cleanup();
    resetToasts();
    client.dispose();
    await server.close();
  });

  it('shows a desktop notification for each automation notify event from the server', async () => {
    const sink = recordingSink();
    render({ mode: 'synced', client, server: null, serverUrl: server.url }, sink);
    await waitUntil(() => server.sockets[0]?.messages.length === 1);

    server.sockets[0]?.send(JSON.stringify({ type: 'event', event: notified('Nová ponuka') }));

    await waitUntil(() => sink.shown.length === 1);
    expect(sink.shown).toEqual(['Tibor Hrasko: Nová ponuka (thread-1)']);
  });

  it('tells the user in the app when the notification could not be shown', async () => {
    const sink = failingSink();
    render({ mode: 'synced', client, server: null, serverUrl: server.url }, sink);
    await waitUntil(() => server.sockets[0]?.messages.length === 1);

    server.sockets[0]?.send(JSON.stringify({ type: 'event', event: notified('Nová ponuka') }));

    await waitUntil(() => useToastStore.getState().toast !== null);
    expect(sink.attempts).toBe(1);
    expect(useToastStore.getState().toast?.message).toBe(NOTIFICATION_FAILED_MESSAGE);
  });
});
