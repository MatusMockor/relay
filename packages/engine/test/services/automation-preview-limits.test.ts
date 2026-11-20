import type { AutomationPreviewBody } from '@relay/shared/api';
import { MessageIdSchema, ThreadIdSchema } from '@relay/shared/domain';
import { describe, expect, it, vi } from 'vitest';
import { folderSetup, syncNow, threadBySubject } from '../support/automation-filters';
import { JIRA, TIBOR } from '../support/automations';
import { deliverMail, ME } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const fromTibor: AutomationPreviewBody = {
  accountId: null,
  match: 'all',
  conditions: [{ type: 'fromAddress', address: TIBOR.email }],
  exceptions: [],
};

const minute = (index: number): string =>
  new Date(Date.parse('2026-11-14T00:00:00.000Z') + index * 60_000).toISOString();

describe('automation preview limits', () => {
  it('reports a truncated preview and skips threads without received mail', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'tibor', from: TIBOR, subject: 'Ponuka' });
    deliverMail(setup.server, 'Sent', { id: 'sent', from: ME, subject: 'Odoslané' });
    await syncNow(setup);
    const copies = async (subject: string, count: number, offset: number) => {
      const thread = threadBySubject(setup.engine, subject);
      const [message] = await setup.engine.repositories.messages.listByThread(USER_ID, thread.id);
      expect(message).toBeDefined();
      for (let index = 0; message !== undefined && index < count; index += 1) {
        const threadId = ThreadIdSchema.parse(`${thread.id}-${String(index)}`);
        const date = minute(offset + index);
        await setup.engine.repositories.threads.upsert({
          ...thread,
          id: threadId,
          subject: `${subject} ${String(index)}`,
          lastMessageAt: date,
        });
        await setup.engine.repositories.messages.upsert(
          {
            ...message,
            id: MessageIdSchema.parse(`${message.id}-${String(index)}`),
            threadId,
            uid: 10_000 + offset + index,
            subject: `${subject} ${String(index)}`,
            date,
          },
          new Map(),
        );
      }
    };
    await copies('Ponuka', 501, 0);
    await copies('Odoslané', 10, 600);

    const preview = await setup.engine.services.automations.preview(USER_ID, fromTibor);

    expect(preview).toMatchObject({ count: 500, truncated: true });
    expect(preview.samples.map((sample) => sample.subject).slice(0, 2)).toEqual([
      'Ponuka',
      'Ponuka 500',
    ]);
  });

  it('classifies Jira mail in batches only when the rule uses Jira conditions', async () => {
    const setup = await folderSetup();
    for (let index = 0; index < 6; index += 1) {
      deliverMail(setup.server, 'INBOX', {
        id: `j${String(index)}`,
        from: JIRA,
        subject: `[EF-${String(index + 1)}] Úloha ${String(index)}`,
        headers: { 'X-Jira-Event': index % 2 === 0 ? 'mention' : 'status' },
      });
    }
    await syncNow(setup);
    const { automationCandidates, messages } = setup.engine.repositories;
    const batches = vi.spyOn(automationCandidates, 'findMessages');
    const threads = vi.spyOn(messages, 'listByThread');

    const plain = await setup.engine.services.automations.preview(USER_ID, {
      ...fromTibor,
      conditions: [{ type: 'fromAddress', address: JIRA.email }],
    });
    expect(plain.count).toBe(6);
    expect(batches).not.toHaveBeenCalled();

    const mentions = await setup.engine.services.automations.preview(USER_ID, {
      ...fromTibor,
      conditions: [{ type: 'fromAddress', address: JIRA.email }],
      exceptions: [{ type: 'jiraEvent', kind: 'status' }],
    });

    expect(mentions).toMatchObject({ count: 3, truncated: false });
    expect(batches).toHaveBeenCalledTimes(1);
    expect(batches.mock.calls[0]?.[1]).toHaveLength(6);
    expect(threads).not.toHaveBeenCalled();
  });
});
