// @vitest-environment jsdom
import { AttachmentIdSchema, type Message, MessageIdSchema } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { forwardTarget } from '../src/features/mail/forward-draft';
import { openThreadBySubject, press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const SUBJECT = 'Obed v piatok?';
const MENU = {
  id: AttachmentIdSchema.parse('att-menu'),
  filename: 'menu.pdf',
  contentType: 'application/pdf',
  size: 1200,
  contentId: null,
  inline: false,
};

const clientWithOwnReply = () => {
  const state = buildDemoState(new Date());
  const record = [...state.threads.values()].find((item) => item.summary.subject === SUBJECT);
  const original = record?.messages[0];
  const account = state.accounts.find((item) => item.id === original?.accountId);
  expect(original).toBeDefined();
  expect(account).toBeDefined();
  if (record !== undefined && original !== undefined && account !== undefined) {
    const reply: Message = {
      ...original,
      id: MessageIdSchema.parse(`${original.id}-reply`),
      uid: original.uid + 1,
      from: { name: null, email: account.email },
      to: original.from === null ? [] : [original.from],
      date: new Date().toISOString(),
      textBody: 'Idem, rezervuj aj pre mňa.',
      snippet: 'Idem, rezervuj aj pre mňa.',
      htmlBody: null,
      attachments: [],
    };
    record.messages.splice(0, 1, { ...original, attachments: [MENU] }, reply);
  }
  return createDemoMailClient({ aiStepMs: 0, state });
};

const composeDialog = () => screen.findByRole('dialog', { name: 'Nová správa' });
const bodyOf = (dialog: HTMLElement) =>
  within(dialog).getByRole<HTMLTextAreaElement>('textbox', { name: 'Text správy' }).value;

describe('forward target', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('picks the requested message, else the latest one with files, else the latest', () => {
    const base = [...buildDemoState(new Date()).threads.values()][0]?.messages[0];
    expect(base).toBeDefined();
    if (base === undefined) {
      return;
    }
    const message = (id: string, files: boolean): Message => ({
      ...base,
      id: MessageIdSchema.parse(id),
      attachments: files ? [MENU] : [],
    });
    const inline = { ...message('m4', false), attachments: [{ ...MENU, inline: true }] };
    const thread = [message('m1', true), message('m2', true), message('m3', false), inline];

    expect(forwardTarget(thread)?.id).toBe('m2');
    expect(forwardTarget(thread, MessageIdSchema.parse('m3'))?.id).toBe('m3');
    expect(forwardTarget([message('m1', true), message('m2', true)])?.id).toBe('m2');
    expect(forwardTarget([message('m1', false), message('m2', false)])?.id).toBe('m2');
    expect(forwardTarget([])).toBeUndefined();
  });

  it('forwards the original with its files after the user replied', async () => {
    const client = clientWithOwnReply();
    renderApp({ demo: () => client });
    await openThreadBySubject(SUBJECT);

    press('f', {}, document.body);

    const dialog = await composeDialog();
    expect(bodyOf(dialog)).toContain('Ahoj, ideme v piatok na obed');
    await waitFor(() => {
      expect(within(dialog).getByRole('list', { name: 'Prílohy' }).textContent).toContain(
        'menu.pdf',
      );
    });
  });

  it('forwards exactly the message whose forward button was used', async () => {
    const client = clientWithOwnReply();
    renderApp({ demo: () => client });
    await openThreadBySubject(SUBJECT);
    const thread = document.getElementById('thread');
    expect(thread).not.toBeNull();
    const buttons = within(thread ?? document.body).getAllByRole('button', {
      name: 'Preposlať túto správu',
    });

    act(() => {
      fireEvent.click(buttons.at(-1) ?? document.body);
    });

    const dialog = await composeDialog();
    expect(bodyOf(dialog)).toContain('Idem, rezervuj aj pre mňa.');
    expect(within(dialog).queryByRole('list', { name: 'Prílohy' })).toBeNull();
  });
});
