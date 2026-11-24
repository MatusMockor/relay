import { performance } from 'node:perf_hooks';
import type { MailAccount, Message } from '@relay/shared/domain';
import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startGatedTcpProxy, type GatedTcpProxy } from './support/gated-tcp-proxy';
import { createGreenMailAccount, type GreenMailAccount, withImap } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { seedImapAccount } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const PDF = Buffer.from('%PDF-1.4\nzmluva 2024\n%%EOF\n', 'utf8');
const OLD_DATE = new Date('2024-03-04T09:00:00.000Z');

const encoded = (text: string): string => `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`;

const oldMail = (to: string, index: number): Buffer =>
  Buffer.from(
    [
      `From: ${encoded('Účtáreň')} <uctaren@firma.test>`,
      `To: ${to}`,
      `Subject: ${encoded(`Stará zmluva ${String(index)}`)}`,
      `Message-ID: <old-${String(index)}@firma.test>`,
      `Date: ${OLD_DATE.toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="hranica"',
      '',
      '--hranica',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      `Dobrý deň, posielame zmluvu číslo ${String(index)}. Celé telo je len na serveri.`,
      '--hranica',
      `Content-Type: application/pdf; name="zmluva-${String(index)}.pdf"`,
      `Content-Disposition: attachment; filename="zmluva-${String(index)}.pdf"`,
      'Content-Transfer-Encoding: base64',
      '',
      PDF.toString('base64'),
      '--hranica--',
      '',
    ].join('\r\n'),
  );

const recentMail = (to: string): Buffer =>
  Buffer.from(
    [
      'From: Jana <jana@firma.test>',
      `To: ${to}`,
      'Subject: Nová správa',
      'Message-ID: <recent@firma.test>',
      `Date: ${new Date().toUTCString()}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Ahoj.',
    ].join('\r\n'),
  );

const timed = async <Result>(work: () => Promise<Result>) => {
  const started = performance.now();
  const result = await work();
  return { result, ms: performance.now() - started };
};

describe('on-demand bodies of remote messages', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let proxy: GatedTcpProxy;
  let harness: LocalRuntimeHarness;
  let account: MailAccount;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await withImap(mailbox, async (client) => {
      for (const index of [1, 2, 3]) {
        await client.append('INBOX', oldMail(mailbox.email, index), ['\\Seen'], OLD_DATE);
      }
      await client.append('INBOX', recentMail(mailbox.email), []);
    });
    proxy = await startGatedTcpProxy(mailbox.host, mailbox.imapPort);
    proxy.release();
    harness = startLocalRuntime(dir);
    account = await seedImapAccount(harness.runtime, mailbox, proxy.port);
  });

  afterEach(async () => {
    await harness.close();
    await proxy.close();
    await mailbox.remove();
    await dir.remove();
  });

  const remoteRows = async (): Promise<Message[]> => {
    const page = await harness.bridge.invoke('local.threads.list', { view: 'archive' });
    const inbox = await harness.bridge.invoke('local.threads.list', { view: 'inbox' });
    const threads = [...(page.ok ? page.data.items : []), ...(inbox.ok ? inbox.data.items : [])];
    const details = await Promise.all(
      threads.map((thread) => harness.bridge.invoke('local.threads.get', { threadId: thread.id })),
    );
    return details
      .flatMap((detail) => (detail.ok ? detail.data.messages : []))
      .filter((message) => message.bodyState === 'remote')
      .sort((left, right) => left.subject.localeCompare(right.subject));
  };

  const body = (message: Message | undefined) =>
    harness.bridge.invoke('local.messages.body', { messageId: message?.id ?? '' });

  it('fetches remote bodies over a lingering session and reports offline', async () => {
    const { services } = harness.runtime.engine;
    await services.sync.syncAccount(LOCAL_USER_ID, account.id);
    expect(await remoteRows()).toEqual([]);
    const report = await services.sync.backfillHistory(LOCAL_USER_ID, account.id);
    expect(report).toMatchObject({ skipped: false, processed: 3 });
    const [first, second, third] = await remoteRows();
    expect(first).toMatchObject({ subject: 'Stará zmluva 1', textBody: null, htmlBody: null });
    expect(first?.snippet).toContain('posielame zmluvu číslo 1');

    const cold = await timed(() => body(first));
    expect(cold.result).toEqual({
      ok: true,
      data: {
        status: 'ok',
        textBody: 'Dobrý deň, posielame zmluvu číslo 1. Celé telo je len na serveri.',
        htmlBody: null,
      },
    });
    const warm = await timed(() => body(second));
    expect(warm.result.ok && warm.result.data.status).toBe('ok');
    const cached = await timed(() => body(first));
    expect(cached.result.ok && cached.result.data.status).toBe('ok');
    expect(services.readSessions.openCount()).toBe(1);

    const attachment = first?.attachments[0];
    expect(attachment).toMatchObject({ filename: 'zmluva-1.pdf', contentType: 'application/pdf' });
    const content = await harness.bridge.invoke('local.attachments.content', {
      attachmentId: attachment?.id ?? '',
    });
    expect(content.ok && Buffer.from(content.data.contentBase64, 'base64')).toEqual(PDF);

    proxy.cut();
    const offline = await timed(() => body(third));
    expect(offline.result).toEqual({ ok: true, data: { status: 'offline' } });
    expect((await body(first)).ok).toBe(true);

    proxy.release();
    const recovered = await timed(() => body(third));
    expect(recovered.result.ok && recovered.result.data.status).toBe('ok');
    const stored = await remoteRows();
    expect(stored.map((message) => message.textBody)).toEqual([null, null, null]);

    console.info(
      `remote body latency on GreenMail: cold ${cold.ms.toFixed(1)} ms, warm ${warm.ms.toFixed(1)} ms, cached ${cached.ms.toFixed(1)} ms, offline ${offline.ms.toFixed(1)} ms, reconnect ${recovered.ms.toFixed(1)} ms`,
    );
    expect(warm.ms).toBeLessThan(800);
  });
});
