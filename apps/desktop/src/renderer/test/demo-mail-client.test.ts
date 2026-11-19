import {
  AccountIdSchema,
  type AiEvent,
  AttachmentIdSchema,
  CreateAccountBodySchema,
  DraftIdSchema,
  MailboxIdSchema,
  type RealtimeEvent,
  ThreadIdSchema,
} from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';

const NOW = new Date(2026, 10, 19, 9, 41);
const EFA = AccountIdSchema.parse('acc-efa');
const LUNCH = ThreadIdSchema.parse('c-lunch');

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const imapBody = (email: string) =>
  CreateAccountBodySchema.parse({
    provider: 'imap',
    email,
    password: 'tajne',
    settings: {
      imap: { host: 'imap.firma.sk', port: 993, secure: true },
      smtp: { host: 'smtp.firma.sk', port: 465, secure: true },
      username: email,
    },
  });

const demoClient = (aiStepMs = 0) => createDemoMailClient({ now: () => NOW, aiStepMs });

describe('demo mail client', () => {
  it('gives accounts created at the same moment their own ids', async () => {
    const client = demoClient();
    const first = await client.createAccount(imapBody('prvy@firma.sk'));
    const second = await client.createAccount(imapBody('druhy@firma.sk'));
    expect(first.id).not.toBe(second.id);
    await client.removeAccount(first.id);
    const emails = (await client.listAccounts()).map((account) => account.email);
    expect(emails).toContain('druhy@firma.sk');
    expect(emails).not.toContain('prvy@firma.sk');
  });

  it('removes the drafts and scheduled sends of a removed account', async () => {
    const client = demoClient();
    expect((await client.listDrafts()).some((draft) => draft.accountId === EFA)).toBe(true);
    await client.removeAccount(EFA);
    expect((await client.listDrafts()).filter((draft) => draft.accountId === EFA)).toEqual([]);
    expect((await client.listScheduled()).filter((item) => item.accountId === EFA)).toEqual([]);
  });

  it('drops the scheduled send of a draft that is deleted or sent right away', async () => {
    const client = demoClient();
    const content = {
      accountId: EFA,
      to: [{ name: null, email: 'jana@firma.sk' }],
      cc: [],
      bcc: [],
      subject: 'Plán na piatok',
      body: 'Ahoj.',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
      attachments: [],
    };
    const deleted = await client.createDraft(content);
    const sent = await client.createDraft(content);
    const scheduledAt = '2026-11-20T08:00:00.000Z';
    await client.send({ source: 'draft', draftId: deleted.id, scheduledAt });
    await client.send({ source: 'draft', draftId: sent.id, scheduledAt });
    const pendingFor = async () =>
      (await client.listScheduled())
        .map((item) => item.draftId)
        .filter((draftId) => draftId === deleted.id || draftId === sent.id);
    expect(await pendingFor()).toEqual([deleted.id, sent.id]);
    await client.deleteDraft(deleted.id);
    await client.send({ source: 'draft', draftId: sent.id });
    expect(await pendingFor()).toEqual([]);
  });

  it('keeps the drafts folder in step with reply drafts', async () => {
    const client = demoClient();
    const inDrafts = async (threadId: string) =>
      (await client.listThreads({ view: 'drafts' })).items.some((item) => item.id === threadId);
    expect(await inDrafts(LUNCH)).toBe(true);
    await client.deleteDraft(DraftIdSchema.parse('draft-lunch'));
    expect(await inDrafts(LUNCH)).toBe(false);
    const created = await client.createDraft({
      accountId: EFA,
      to: [],
      cc: [],
      bcc: [],
      subject: 'Re: Obed v piatok?',
      body: 'Idem.',
      inReplyToThreadId: LUNCH,
      inReplyToMessageId: null,
      attachments: [],
    });
    expect(await inDrafts(LUNCH)).toBe(true);
    await client.deleteDraft(created.id);
    expect(await inDrafts(LUNCH)).toBe(false);
  });

  it('keeps attachments on a sent message', async () => {
    const client = demoClient();
    const attachment = {
      id: AttachmentIdSchema.parse('att-1'),
      filename: 'faktura.pdf',
      contentType: 'application/pdf',
      size: 1_024,
    };
    const sent = await client.send({
      source: 'inline',
      draft: {
        accountId: EFA,
        to: [{ name: 'Tomáš', email: 'tomas@firma.sk' }],
        cc: [],
        bcc: [],
        subject: 'Faktúra',
        body: 'Posielam faktúru.',
        inReplyToThreadId: null,
        inReplyToMessageId: null,
        attachments: [attachment],
      },
    });
    expect(sent.status).toBe('sent');
    const threadId = sent.status === 'sent' ? sent.threadId : null;
    expect(threadId).not.toBeNull();
    const detail = await client.getThread(threadId ?? LUNCH);
    expect(detail.messages[0]?.attachments).toEqual([
      { ...attachment, contentId: null, inline: false },
    ]);
  });

  it('bounds a task title taken from a long hint', async () => {
    const client = demoClient();
    const events: AiEvent[] = [];
    client.runAi(
      { input: { kind: 'createTask', threadId: LUNCH, hint: 'a'.repeat(1_200) } },
      (event) => events.push(event),
    );
    const outputs = () =>
      events.flatMap((event) =>
        event.type === 'completed' && event.output.kind === 'createTask' ? [event.output] : [],
      );
    await expect.poll(() => outputs().length).toBe(1);
    expect(outputs()[0]?.title.length).toBe(500);
  });

  it('summarizes a demo thread only when asked', async () => {
    const client = demoClient();
    const { items } = await client.listThreads({ view: 'inbox', limit: 100 });
    const details = await Promise.all(items.map((thread) => client.getThread(thread.id)));
    const unsummarized = details.find((detail) => detail.aiSummary === null);
    expect(unsummarized).toBeDefined();
    const threadId = unsummarized?.thread.id ?? LUNCH;

    expect(await client.prepareThreadAi(threadId, 'Europe/Bratislava')).toEqual({
      pending: [],
      jobs: [],
    });
    expect((await client.getThread(threadId)).aiSummary).toBeNull();
    expect(await client.requestThreadSummary(threadId, 'Europe/Bratislava')).toEqual({
      pending: [],
      jobs: [],
    });
    expect((await client.getThread(threadId)).aiSummary).not.toBeNull();
  });

  it('marks every unread thread of one folder read and leaves the others alone', async () => {
    const state = buildDemoState(NOW);
    const client = createDemoMailClient({ now: () => NOW, aiStepMs: 0, state });
    const events: RealtimeEvent[] = [];
    client.subscribe((event) => events.push(event));
    const before = await client.listThreads({ view: 'inbox', limit: 100 });
    const unreadIds = before.items.filter((thread) => thread.unread).map((thread) => thread.id);
    expect(unreadIds.length).toBeGreaterThan(0);
    const inboxIds = new Set(before.items.map((thread) => thread.id));
    const unreadElsewhere = () =>
      [...state.threads.values()]
        .filter((record) => !inboxIds.has(record.summary.id) && record.summary.unread)
        .map((record) => record.summary.id);
    const elsewhere = unreadElsewhere();
    expect(elsewhere.length).toBeGreaterThan(0);

    const result = await client.markFolderRead({ view: 'inbox' });

    expect(result).toEqual({ count: unreadIds.length });
    const after = await client.listThreads({ view: 'inbox', limit: 100 });
    expect(after.items.some((thread) => thread.unread)).toBe(false);
    expect(unreadElsewhere()).toEqual(elsewhere);
    await expect
      .poll(() =>
        events.flatMap((event) => (event.type === 'thread.upserted' ? [event.data.thread.id] : [])),
      )
      .toEqual(unreadIds);
    expect(await client.markFolderRead({ view: 'inbox' })).toEqual({ count: 0 });
  });

  it('keeps a thread marked unread after its move is undone', async () => {
    const state = buildDemoState(NOW);
    const client = createDemoMailClient({ now: () => NOW, aiStepMs: 0, state });
    const read = [...state.threads.values()].find(
      (record) => record.summary.state === 'inbox' && !record.summary.unread,
    );
    expect(read).toBeDefined();
    const threadId = read?.summary.id ?? LUNCH;
    const origin = (await client.getThread(threadId)).messages.map((message) => message.mailboxId);
    const archive = state.mailboxes.find(
      (mailbox) => mailbox.accountId === read?.summary.accountId && mailbox.role === 'archive',
    );
    expect(archive).toBeDefined();

    await client.applyThreadAction(threadId, {
      type: 'move',
      mailboxId: MailboxIdSchema.parse(archive?.id),
    });
    await client.applyThreadAction(threadId, { type: 'markUnread' });
    const restored = await client.applyThreadAction(threadId, { type: 'undoMove' });

    expect(restored.unread).toBe(true);
    const detail = await client.getThread(threadId);
    expect(detail.messages.some((message) => !message.flags.seen)).toBe(true);
    expect(detail.messages.map((message) => message.mailboxId)).toEqual(origin);
  });

  it('stops running AI work when it is disposed', async () => {
    const client = demoClient(10);
    const events: AiEvent[] = [];
    client.runAi(
      { input: { kind: 'createTask', threadId: LUNCH, hint: 'Zavolať Tomášovi' } },
      (event) => events.push(event),
    );
    client.dispose();
    await pause(80);
    expect(events).toEqual([]);
    expect(
      (await client.listTasks({})).items.some((task) => task.title === 'Zavolať Tomášovi'),
    ).toBe(false);
  });
});
