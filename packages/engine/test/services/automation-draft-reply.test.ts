import type { AiRequest } from '../../src';
import type { AiEvent } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow, threadBySubject } from '../support/automation-filters';
import { onlyEntry, undoEntry } from '../support/automation-history';
import { jobsOf, TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const draftReply = (request: AiRequest): readonly AiEvent[] => {
  const { input } = request;
  if (input.kind !== 'automationDraft') {
    return [{ type: 'failed', code: 'invalid_output', message: `unexpected ${input.kind}` }];
  }
  return [
    {
      type: 'completed',
      output: {
        kind: 'automationDraft',
        threadId: input.threadId,
        messageId: input.messageId,
        body: '  Ahoj Tibor, ponuku pošlem do piatku.  ',
      },
    },
  ];
};

const RULE_AI = {
  runner: 'claude',
  model: 'claude-opus-5-5',
  effort: 'high',
  instructions: 'Odpovedaj stručne.',
} as const;

describe('draft reply automation action', () => {
  it('queues an AI reply on the rule model and saves it as a draft in the thread', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'draftReply' }], ai: RULE_AI });
    setup.engine.claude.respondWith(draftReply);
    deliverMail(setup.server, 'INBOX', {
      id: 'm1',
      from: TIBOR,
      subject: 'Ponuka',
      headers: { 'Reply-To': 'obchod@efabrica.test' },
    });

    await syncNow(setup);
    const [job] = jobsOf(setup.engine, 'automationDraft');
    expect(job).toMatchObject({
      status: 'queued',
      model: 'claude-opus-5-5',
      effort: 'high',
      input: { automationId: rule.id, instructions: 'Odpovedaj stručne.' },
    });
    await setup.engine.services.ai.processQueued();

    const thread = threadBySubject(setup.engine, 'Ponuka');
    const [message] = await setup.engine.repositories.messages.listByThread(USER_ID, thread.id);
    const [draft] = await setup.engine.services.compose.listDrafts(USER_ID);
    expect(draft).toMatchObject({
      accountId: setup.account.id,
      to: [{ email: 'obchod@efabrica.test' }],
      subject: 'Re: Ponuka',
      body: 'Ahoj Tibor, ponuku pošlem do piatku.',
      inReplyToThreadId: thread.id,
      inReplyToMessageId: present(message).id,
    });
    expect(thread.hasDraft).toBe(true);
    expect(
      setup.engine.events.ofType('draft.upserted').map((event) => event.data.draft.id),
    ).toEqual([present(draft).id]);
    const entry = await onlyEntry(setup, rule);
    await expect(undoEntry(setup, rule, entry)).resolves.toMatchObject({
      results: [{ action: { type: 'draftReply' }, outcome: 'notUndoable' }],
      entry: { undoneAt: null },
    });
    expect(await setup.engine.services.compose.listDrafts(USER_ID)).toHaveLength(1);
  });

  it('keeps a draft the user already started in the thread', async () => {
    const setup = await folderSetup();
    await saveRule(setup, { actions: [{ type: 'draftReply' }], ai: RULE_AI });
    setup.engine.claude.respondWith(draftReply);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Ponuka' });
    await syncNow(setup);
    const thread = threadBySubject(setup.engine, 'Ponuka');
    const own = await setup.engine.services.compose.createDraft(USER_ID, {
      accountId: setup.account.id,
      to: [TIBOR],
      cc: [],
      bcc: [],
      subject: 'Re: Ponuka',
      body: 'Moja odpoveď',
      inReplyToThreadId: thread.id,
      inReplyToMessageId: null,
      attachments: [],
    });

    await setup.engine.services.ai.processQueued();

    expect(await setup.engine.services.compose.listDrafts(USER_ID)).toEqual([own]);
  });

  it('never drafts replies for existing mail', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Stará ponuka' });
    await syncNow(setup);
    const rule = await saveRule(setup, {
      actions: [{ type: 'draftReply' }, { type: 'pin' }],
      ai: RULE_AI,
    });

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 1, applied: 1, failed: 0 });

    expect(jobsOf(setup.engine, 'automationDraft')).toEqual([]);
    expect((await onlyEntry(setup, rule)).actions).toMatchObject([
      { action: { type: 'pin' }, outcome: 'ok' },
    ]);
  });
});
