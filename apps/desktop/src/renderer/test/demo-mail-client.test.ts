import {
  AccountIdSchema,
  type AiEvent,
  AttachmentIdSchema,
  CreateAccountBodySchema,
  DraftIdSchema,
  ThreadIdSchema,
} from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';

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
