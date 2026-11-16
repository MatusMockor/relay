// @vitest-environment jsdom
import '../support/node-abort-globals';
import { randomUUID } from 'node:crypto';
import {
  type RealtimeEvent,
  ThreadIdSchema,
  type ThreadPage,
  type ThreadSummary,
} from '@relay/shared';
import { act, cleanup, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  useAccounts,
  useThreadDetail,
  useThreadList,
} from '../../../src/renderer/src/data/hooks/use-mail-queries';
import { useRealtimeSync } from '../../../src/renderer/src/data/hooks/use-realtime-sync';
import { useThreadAction } from '../../../src/renderer/src/data/hooks/use-thread-action';
import type { MailClient } from '../../../src/renderer/src/data/MailClient';
import {
  createGreenMailAccount,
  type GreenMailAccount,
  subjectsIn,
} from '../../main/support/greenmail';
import { createMailbox, imapAccount, receivedIn, sendMail } from './support/mail-fixtures';
import { createQueryHarness } from './support/query-harness';
import { type RelayServer, SERVER_HOOK_TIMEOUT_MS, startRelayServer } from './support/relay-server';
import { startSyncedDesktop, type SyncedDesktop, uniqueEmail } from './support/synced-desktop';

const SYNC_TIMEOUT = { timeout: 20_000 };

const subjectsOf = (page: ThreadPage | undefined): string[] =>
  (page?.items ?? []).map((thread) => thread.subject).sort();

describe('synced mail flow against the real server and GreenMail', { timeout: 60_000 }, () => {
  let server: RelayServer | null = null;
  let desktop: SyncedDesktop | null = null;
  let owner: GreenMailAccount | null = null;
  let partner: GreenMailAccount | null = null;
  let events: RealtimeEvent[] = [];

  beforeAll(async () => {
    server = await startRelayServer();
  }, SERVER_HOOK_TIMEOUT_MS);

  beforeEach(async () => {
    desktop = await startSyncedDesktop(server?.url ?? '');
    owner = await createMailbox();
    partner = await createGreenMailAccount();
    await desktop.register(uniqueEmail('mail'));
    events = [];
  });

  afterEach(async () => {
    cleanup();
    await desktop?.close();
    await owner?.remove();
    await partner?.remove();
  });

  afterAll(async () => {
    await server?.close();
  }, SERVER_HOOK_TIMEOUT_MS);

  const context = () => {
    expect(desktop).not.toBeNull();
    expect(owner).not.toBeNull();
    expect(partner).not.toBeNull();
    return {
      desktop: desktop as SyncedDesktop,
      owner: owner as GreenMailAccount,
      partner: partner as GreenMailAccount,
    };
  };

  const openClient = (): MailClient => {
    const client = context().desktop.openClient();
    client.subscribe((event) => {
      events.push(event);
    });
    return client;
  };

  const connectAccount = async (client: MailClient) => {
    const body = imapAccount(context().owner);
    expect(
      await client.testConnection({ settings: body.settings, password: body.password }),
    ).toEqual({ imap: { ok: true, error: null }, smtp: { ok: true, error: null } });
    return client.createAccount(body);
  };

  const firstThread = async (client: MailClient): Promise<ThreadSummary> => {
    let threads: ThreadSummary[] = [];
    await expect
      .poll(async () => {
        threads = (await client.listThreads({ view: 'inbox' })).items;
        return threads.length;
      }, SYNC_TIMEOUT)
      .toBe(1);
    expect(threads[0]).toBeDefined();
    return threads[0] as ThreadSummary;
  };

  it('adds an IMAP account and the inbox hooks follow the realtime sync', async () => {
    const { desktop: app, owner: mailbox, partner: sender } = context();
    await sendMail(sender, mailbox, 'Faktúra za október', 'Posielam faktúru.');
    const client = openClient();
    const harness = createQueryHarness(client, app.serverUrl);
    const { result } = harness.render(() => {
      useRealtimeSync();
      return { inbox: useThreadList({ view: 'inbox' }), accounts: useAccounts() };
    });
    await expect.poll(() => app.realtime.at(-1), { timeout: 10_000 }).toBe('online');
    await waitFor(() => {
      expect(result.current.inbox.data?.items).toEqual([]);
    });

    const account = await connectAccount(client);

    await waitFor(() => {
      expect(subjectsOf(result.current.inbox.data)).toEqual(['Faktúra za október']);
    }, SYNC_TIMEOUT);
    await waitFor(() => {
      expect(result.current.accounts.data?.map((item) => item.email)).toEqual([mailbox.email]);
    });
    expect(
      events.some(
        (event) =>
          event.type === 'thread.upserted' && event.data.thread.subject === 'Faktúra za október',
      ),
    ).toBe(true);

    await sendMail(sender, mailbox, 'Druhá správa', 'Ešte jedna vec.');
    await client.syncNow(account.id);

    await waitFor(() => {
      expect(subjectsOf(result.current.inbox.data)).toEqual(['Druhá správa', 'Faktúra za október']);
    }, SYNC_TIMEOUT);

    await sendMail(sender, mailbox, 'Tretia správa', 'Synchronizuj všetky účty.');
    await client.syncNow();

    await waitFor(() => {
      expect(subjectsOf(result.current.inbox.data)).toEqual([
        'Druhá správa',
        'Faktúra za október',
        'Tretia správa',
      ]);
    }, SYNC_TIMEOUT);
    const perAccount = await client.listThreads({ view: 'inbox', accountId: account.id });
    expect(subjectsOf(perAccount)).toEqual(['Druhá správa', 'Faktúra za október', 'Tretia správa']);
  });

  it('opens a thread, archives it and moves it back in GreenMail', async () => {
    const { owner: mailbox, partner: sender, desktop: app } = context();
    await sendMail(sender, mailbox, 'Zmluva na podpis', 'Prosím o podpis zmluvy.');
    const client = openClient();
    await connectAccount(client);
    const thread = await firstThread(client);
    const harness = createQueryHarness(client, app.serverUrl);
    const { result } = harness.render(() => ({
      detail: useThreadDetail(thread.id),
      action: useThreadAction(),
    }));
    await waitFor(() => {
      expect(result.current.detail.data?.messages[0]?.textBody).toContain(
        'Prosím o podpis zmluvy.',
      );
    });

    await act(() =>
      result.current.action.mutateAsync({ threadId: thread.id, action: { type: 'done' } }),
    );

    await waitFor(() => {
      expect(result.current.detail.data?.thread.state).toBe('done');
    });
    await expect
      .poll(() => subjectsIn(mailbox, 'Archive'), { timeout: 10_000 })
      .toEqual(['Zmluva na podpis']);
    expect(await subjectsIn(mailbox, 'INBOX')).toEqual([]);
    const done = await client.listThreads({ view: 'done' });
    expect(done.items.map((item) => item.id)).toEqual([thread.id]);

    await act(() =>
      result.current.action.mutateAsync({ threadId: thread.id, action: { type: 'undone' } }),
    );

    await expect
      .poll(() => subjectsIn(mailbox, 'INBOX'), { timeout: 10_000 })
      .toEqual(['Zmluva na podpis']);
    expect(await subjectsIn(mailbox, 'Archive')).toEqual([]);
    await waitFor(() => {
      expect(result.current.detail.data?.thread.state).toBe('inbox');
    });
    const missing = ThreadIdSchema.parse(randomUUID());
    await expect(client.getThread(missing)).rejects.toMatchObject({
      code: 'not_found',
      message: `Thread ${missing} was not found`,
      status: 404,
    });
  });

  it('sends a reply that reaches the sender through GreenMail', async () => {
    const { owner: mailbox, partner: sender } = context();
    await sendMail(sender, mailbox, 'Otázka k projektu', 'Kedy začíname?');
    const client = openClient();
    const account = await connectAccount(client);
    const thread = await firstThread(client);
    const detail = await client.getThread(thread.id);
    const original = detail.messages[0];
    expect(original?.messageIdHeader).toBeTruthy();

    const sent = await client.send({
      source: 'inline',
      draft: {
        accountId: account.id,
        to: [{ name: 'Partner', email: sender.email }],
        cc: [],
        bcc: [],
        subject: 'Re: Otázka k projektu',
        body: 'Začíname v pondelok.',
        inReplyToThreadId: thread.id,
        inReplyToMessageId: original?.id ?? null,
        attachments: [],
      },
    });

    expect(sent).toMatchObject({ status: 'sent', threadId: thread.id });
    await expect
      .poll(
        async () =>
          (await receivedIn(sender, 'INBOX')).find(
            (mail) => mail.subject === 'Re: Otázka k projektu',
          )?.inReplyTo,
        SYNC_TIMEOUT,
      )
      .toBe(original?.messageIdHeader);
    await expect
      .poll(async () => (await client.getThread(thread.id)).messages.length, SYNC_TIMEOUT)
      .toBe(2);
  });
});
