// @vitest-environment jsdom
import type { MessageBodyResult, MessageId, ThreadDetail } from '@relay/shared';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import type { DemoRemoteBody } from '../src/data/demo/demo-message-bodies';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { withForwardBody } from '../src/features/mail/forward-body';
import { GONE_NOTICE, OFFLINE_NOTICE } from '../src/features/thread/RemoteBody';
import { openThreadBySubject, press } from './features-support';
import { present } from './support/present';
import { renderApp, resetStores } from './support/render-app';

const SUBJECT = 'Obed v piatok?';
const SNIPPET = 'Ahoj, ideme v piatok na obed';
const FULL_TEXT = 'Ahoj, ideme v piatok na obed do bistra. Celé telo prišlo zo servera.';

interface RemoteFixture {
  offline: boolean;
  readonly bodies: Map<MessageId, DemoRemoteBody>;
  readonly messageId: MessageId;
  readonly state: ReturnType<typeof buildDemoState>;
}

const remoteFixture = (): RemoteFixture => {
  const state = buildDemoState(new Date());
  const record = present(
    [...state.threads.values()].find((item) => item.summary.subject === SUBJECT),
  );
  const original = present(record.messages[0]);
  record.messages.splice(0, 1, {
    ...original,
    bodyState: 'remote',
    textBody: null,
    htmlBody: null,
    snippet: SNIPPET,
  });
  return {
    offline: false,
    bodies: new Map([[original.id, { textBody: FULL_TEXT, htmlBody: null }]]),
    messageId: original.id,
    state,
  };
};

const render = (fixture: RemoteFixture, delayMs = 0) =>
  renderApp({
    demo: () =>
      createDemoMailClient({
        aiStepMs: 0,
        state: fixture.state,
        remoteBodies: { delayMs, offline: () => fixture.offline, bodies: fixture.bodies },
      }),
  });

const threadPane = () => present(document.getElementById('thread'));

const composeBody = async (): Promise<string> => {
  const dialog = await screen.findByRole('dialog', { name: 'Nová správa' });
  return within(dialog).getByRole<HTMLTextAreaElement>('textbox', { name: 'Text správy' }).value;
};

describe('remote message bodies', () => {
  beforeEach(() => {
    resetStores();
    onlineManager.setOnline(true);
  });
  afterEach(() => {
    resetStores();
    onlineManager.setOnline(true);
  });

  it('shows the snippet with a skeleton, then the body fetched from the server', async () => {
    const fixture = remoteFixture();
    render(fixture, 30);
    await openThreadBySubject(SUBJECT);

    expect(within(threadPane()).getByLabelText('Načítavam správu zo servera')).toBeTruthy();
    expect(threadPane().textContent).toContain(SNIPPET);

    await waitFor(() => {
      expect(threadPane().textContent).toContain('Celé telo prišlo zo servera.');
    });
    expect(within(threadPane()).queryByRole('status')).toBeNull();
  });

  it('shows the offline notice and the body after the connection returns', async () => {
    const fixture = remoteFixture();
    fixture.offline = true;
    render(fixture);
    await openThreadBySubject(SUBJECT);

    const notice = await within(threadPane()).findByRole('status');
    expect(notice.textContent).toBe(OFFLINE_NOTICE);
    expect(threadPane().textContent).toContain(SNIPPET);

    fixture.offline = false;
    act(() => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });

    await waitFor(() => {
      expect(threadPane().textContent).toContain('Celé telo prišlo zo servera.');
    });
    expect(within(threadPane()).queryByRole('status')).toBeNull();
  });

  it('tells the user when the server no longer has the message', async () => {
    const fixture = remoteFixture();
    fixture.bodies.clear();
    render(fixture);
    await openThreadBySubject(SUBJECT);

    const notice = await within(threadPane()).findByRole('status');
    expect(notice.textContent).toBe(GONE_NOTICE);
    expect(threadPane().textContent).toContain(SNIPPET);
  });

  it('forwards the fetched body of a remote message', async () => {
    const fixture = remoteFixture();
    render(fixture, 30);
    await openThreadBySubject(SUBJECT);

    press('f', {}, document.body);

    expect(await composeBody()).toContain(FULL_TEXT);
  });

  it('forwards the snippet when the body cannot be fetched', async () => {
    const fixture = remoteFixture();
    fixture.offline = true;
    render(fixture);
    await openThreadBySubject(SUBJECT);

    press('f', {}, document.body);

    const body = await composeBody();
    expect(body).toContain(SNIPPET);
    expect(body).not.toContain('Celé telo');
  });

  it('stops waiting for a slow body after the wait limit', async () => {
    const fixture = remoteFixture();
    const record = present(
      [...fixture.state.threads.values()].find((item) => item.summary.subject === SUBJECT),
    );
    const detail: ThreadDetail = {
      thread: record.summary,
      messages: record.messages,
      aiSummary: null,
      checklist: [],
      replySuggestions: [],
    };
    const never = () => new Promise<MessageBodyResult>(() => undefined);

    await expect(withForwardBody(detail, fixture.messageId, never, 10)).resolves.toBe(detail);
  });
});
