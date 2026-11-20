import { performance } from 'node:perf_hooks';
import type { MailAccount } from '@relay/shared/domain';
import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startGatedTcpProxy, type GatedTcpProxy } from './support/gated-tcp-proxy';
import { createGreenMailAccount, type GreenMailAccount, withImap } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { seedImapAccount } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const OLD_DATE = new Date('2024-03-04T09:00:00.000Z');
const FOLDERS = [
  'Archive',
  ...Array.from({ length: 8 }, (_, index) => `Projekt ${String(index + 1)}`),
];

const encoded = (text: string): string => `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`;

const mail = (to: string, id: string, subject: string, body: string, date: Date): Buffer =>
  Buffer.from(
    [
      `From: ${encoded('Účtáreň')} <uctaren@firma.test>`,
      `To: ${to}`,
      `Subject: ${encoded(subject)}`,
      `Message-ID: <${id}@firma.test>`,
      `Date: ${date.toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
      '',
    ].join('\r\n'),
  );

const searchRequest = (q: string) => ({ requestId: `search-${q}`, q });

describe('server search over IPC against GreenMail', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let proxy: GatedTcpProxy;
  let harness: LocalRuntimeHarness;
  let account: MailAccount;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await withImap(mailbox, async (client) => {
      const to = mailbox.email;
      await client.append('INBOX', mail(to, 'recent', 'Nová správa', 'Ahoj.', new Date()), []);
      await client.append(
        'INBOX',
        mail(to, 'old-inbox', 'Stará faktúra', 'Faktúra za žltého koňa.', OLD_DATE),
        ['\\Seen'],
        OLD_DATE,
      );
      for (const [index, folder] of FOLDERS.entries()) {
        await client.mailboxCreate(folder);
        for (const item of [0, 1, 2]) {
          const id = `old-${String(index)}-${String(item)}`;
          const body = item === 0 ? `Dodávka ${String(index)}: žltý kôň.` : 'Obyčajný text.';
          const subject = `Archív ${String(index)}-${String(item)}`;
          await client.append(folder, mail(to, id, subject, body, OLD_DATE), ['\\Seen'], OLD_DATE);
        }
      }
    });
    proxy = await startGatedTcpProxy(mailbox.host, mailbox.imapPort);
    proxy.release();
    harness = startLocalRuntime(dir);
    account = await seedImapAccount(harness.runtime, mailbox, proxy.port);
    await harness.runtime.engine.services.sync.syncAccount(LOCAL_USER_ID, account.id);
  });

  afterEach(async () => {
    await harness.close();
    await proxy.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('finds old mail on the server, stores it header-only and opens it with its body', async () => {
    const started = performance.now();
    const response = await harness.bridge.invoke('local.search.server', searchRequest('žltý kôň'));
    const coldMs = performance.now() - started;
    expect(response.ok).toBe(true);
    const data = response.ok ? response.data : null;
    expect(data?.status).toBe('ok');
    expect(data?.requestId).toBe('search-žltý kôň');
    expect(data?.hits.map((hit) => hit.thread.subject).sort()).toEqual(
      FOLDERS.map((_, index) => `Archív ${String(index)}-0`).sort(),
    );

    const hit = data?.hits.find((found) => found.thread.subject === 'Archív 0-0');
    const detail = await harness.bridge.invoke('local.threads.get', {
      threadId: hit?.thread.id ?? '',
    });
    const message = detail.ok ? detail.data.messages[0] : undefined;
    expect(message).toMatchObject({ id: hit?.messageId, bodyState: 'remote', textBody: null });
    const body = await harness.bridge.invoke('local.messages.body', {
      messageId: hit?.messageId ?? '',
    });
    expect(body.ok && body.data).toMatchObject({ status: 'ok' });
    expect(body.ok && body.data.status === 'ok' && body.data.textBody).toContain('žltý kôň');

    const warmStarted = performance.now();
    const warm = await harness.bridge.invoke('local.search.server', searchRequest('faktúra'));
    const warmMs = performance.now() - warmStarted;
    expect(warm.ok && warm.data.hits.map((found) => found.thread.subject)).toEqual([
      'Stará faktúra',
    ]);
    const stored = await Promise.all(
      (data?.hits ?? []).map((found) =>
        harness.bridge.invoke('local.threads.get', { threadId: found.thread.id }),
      ),
    );
    const states = stored.flatMap((entry) =>
      entry.ok ? entry.data.messages.map((item) => item.bodyState ?? 'local') : [],
    );
    expect(states.filter((state) => state === 'remote')).toHaveLength(1);
    expect(states.filter((state) => state === 'local')).toHaveLength(8);

    console.info(
      `server search latency on GreenMail (${String(FOLDERS.length + 1)} folders): cold ${coldMs.toFixed(1)} ms, warm ${warmMs.toFixed(1)} ms`,
    );
    expect(coldMs).toBeLessThan(3_000);
  });

  it('answers offline when the mail server cannot be reached', async () => {
    proxy.cut();

    const response = await harness.bridge.invoke('local.search.server', searchRequest('kôň'));

    expect(response).toEqual({
      ok: true,
      data: { requestId: 'search-kôň', status: 'offline', hits: [] },
    });
  });

  it('rejects an invalid request at the IPC boundary', async () => {
    const response = await harness.bridge.invoke('local.search.server', {
      requestId: '',
      q: '   ',
    });

    expect(response.ok).toBe(false);
  });
});
