// @vitest-environment jsdom
import { type AiJob, DEFAULT_USER_SETTINGS, type ThreadDetail } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ContractServer, startContractServer } from './support/contract-server';
import { resetStores } from './support/render-app';
import {
  jobOf,
  openFirstThread,
  pushJob,
  refOf,
  requestCount,
  welcomeOnHello,
} from './support/thread-ai-session';
import { serverDetail, serverThread } from './support/thread-fixtures';

const SUMMARY_ASK = /^(Zhrnúť vlákno|Podrobné zhrnutie)$/;

const SUMMARY = 'Jana posiela zmluvu na podpis.';
const CHECKLIST = [{ id: 'check-1', text: 'Podpísať do piatku', done: false }];

describe('thread summary on demand', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
    welcomeOnHello(server);
    server.handle('threads.prepareAi', () => ({ body: { pending: [] } }));
    server.handle('threads.requestSummary', () => ({
      body: { pending: ['summary'], jobs: [refOf('summary')] },
    }));
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const serveDetail = (initial: ThreadDetail) => {
    const holder = { detail: initial };
    server.handle('threads.get', () => ({ body: holder.detail }));
    return holder;
  };

  const askForSummary = async () => {
    const ask = await screen.findByRole('button', { name: SUMMARY_ASK });
    act(() => {
      fireEvent.click(ask);
    });
  };

  it('shows an existing summary with its checklist without a click', async () => {
    const thread = serverThread('Hotové zhrnutie');
    serveDetail(serverDetail(thread, [], { aiSummary: SUMMARY, checklist: CHECKLIST }));

    await openFirstThread(server, [thread]);

    const summary = await screen.findByRole('region', { name: 'Zhrnutie' });
    expect(within(summary).getByText(SUMMARY)).toBeDefined();
    expect(within(summary).getByRole('button', { name: /Podpísať do piatku/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: SUMMARY_ASK })).toBeNull();
    expect(requestCount(server, 'threads.requestSummary')).toBe(0);
  });

  it('requests the summary only after a click and renders the result', async () => {
    const thread = serverThread('Zmluva na podpis');
    const served = serveDetail(serverDetail(thread, []));

    await openFirstThread(server, [thread]);
    expect(await screen.findByRole('button', { name: SUMMARY_ASK })).toBeDefined();
    expect(requestCount(server, 'threads.requestSummary')).toBe(0);

    await askForSummary();

    const summary = await screen.findByRole('region', { name: 'Zhrnutie' });
    expect(await within(summary).findByText('AI pripravuje zhrnutie…')).toBeDefined();
    expect(screen.queryByRole('button', { name: SUMMARY_ASK })).toBeNull();
    await waitFor(() => {
      const request = server.requests.find((entry) => entry.key === 'threads.requestSummary');
      expect(request?.method).toBe('POST');
      expect(request?.url).toMatch(/^\/threads\/thread-1\/ai\/summary/);
    });

    served.detail = serverDetail(thread, [], { aiSummary: SUMMARY, checklist: CHECKLIST });
    act(() => {
      pushJob(server, jobOf('summary', thread.id, 'done'));
    });

    expect(await screen.findByText(SUMMARY)).toBeDefined();
    expect(screen.getByRole('button', { name: /Podpísať do piatku/ })).toBeDefined();
    expect(screen.queryByText('AI pripravuje zhrnutie…')).toBeNull();
    expect(screen.queryByRole('button', { name: SUMMARY_ASK })).toBeNull();
    expect(requestCount(server, 'threads.requestSummary')).toBe(1);
  });

  it('offers the full summary next to the one-liner', async () => {
    const thread = serverThread('Krátko', { aiOneLiner: 'Jana posiela zmluvu.' });
    serveDetail(serverDetail(thread, []));

    await openFirstThread(server, [thread]);

    const summary = await screen.findByRole('region', { name: 'Zhrnutie' });
    expect(within(summary).getByText('Jana posiela zmluvu.')).toBeDefined();
    await askForSummary();
    expect(await within(summary).findByText('AI dopĺňa podrobnosti…')).toBeDefined();
  });

  it('does not offer the summary when summaries are turned off', async () => {
    const { ai } = DEFAULT_USER_SETTINGS;
    server.handle('settings.get', () => ({
      body: {
        ...DEFAULT_USER_SETTINGS,
        ai: { ...ai, features: { ...ai.features, summaries: false } },
      },
    }));
    const thread = serverThread('Bez AI', { aiOneLiner: 'Jana posiela zmluvu.' });
    serveDetail(serverDetail(thread, []));

    await openFirstThread(server, [thread]);

    expect(await screen.findByText('Jana posiela zmluvu.')).toBeDefined();
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    expect(screen.queryByRole('button', { name: SUMMARY_ASK })).toBeNull();
  });

  it('offers the summary again when the job fails', async () => {
    const thread = serverThread('Zlyhanie');
    serveDetail(serverDetail(thread, []));

    await openFirstThread(server, [thread]);
    await askForSummary();
    expect(await screen.findByText('AI pripravuje zhrnutie…')).toBeDefined();
    act(() => {
      pushJob(server, jobOf('summary', thread.id, 'error'));
    });

    expect(await screen.findByRole('button', { name: SUMMARY_ASK })).toBeDefined();
    expect(screen.queryByText('AI pripravuje zhrnutie…')).toBeNull();
  });

  it('reconciles a requested summary after the realtime connection comes back', async () => {
    const thread = serverThread('Výpadok spojenia');
    const served = serveDetail(serverDetail(thread, []));
    let status: AiJob['status'] = 'running';
    server.handle('ai.getJob', () => ({ body: jobOf('summary', thread.id, status) }));

    await openFirstThread(server, [thread]);
    await askForSummary();
    expect(await screen.findByText('AI pripravuje zhrnutie…')).toBeDefined();
    await waitFor(() => {
      expect(requestCount(server, 'ai.getJob')).toBe(1);
    });

    status = 'done';
    served.detail = serverDetail(thread, [], { aiSummary: 'Hotové počas výpadku.' });
    act(() => {
      server.sockets[0]?.close();
    });

    expect(await screen.findByText('Hotové počas výpadku.', {}, { timeout: 5_000 })).toBeDefined();
    expect(screen.queryByText('AI pripravuje zhrnutie…')).toBeNull();
    expect(server.sockets.length).toBeGreaterThan(1);
    expect(requestCount(server, 'threads.requestSummary')).toBe(1);
  });
});
