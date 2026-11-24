import type { Mailbox, Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { HydrationCandidate } from '../../src/ports/message-body-store';
import { planHydration } from '../../src/services/bodies/hydration-batches';
import type { HistoryTarget } from '../../src/services/sync/history/history-mailboxes';
import { present } from '../support/fixtures';
import { gmailInboxAndAllMail } from '../support/placements';
import { createTestEngine, type TestEngine } from '../support/test-engine';

const LIMITS = { batchSize: 10, batchBytes: 1_000_000, messageBytes: 500_000 };

const candidateIn = (message: Message, mailbox: Mailbox): HydrationCandidate => ({
  messageId: message.id,
  threadId: message.threadId,
  mailboxId: mailbox.id,
  uid: present(message.placements.find((placement) => placement.mailboxId === mailbox.id)).uid,
  messageIdHeader: message.messageIdHeader,
  snippet: message.snippet,
  attachments: message.attachments,
});

const targetOf = async (engine: TestEngine, mailbox: Mailbox): Promise<HistoryTarget> => ({
  mailbox,
  state: present(await engine.repositories.syncStates.find(mailbox.id)),
});

const planned = (plan: ReturnType<typeof planHydration>) =>
  plan.batches.map((batch) => ({
    path: batch.target?.mailbox.path,
    candidates: batch.candidates.map(({ messageId, uid }) => ({ messageId, uid })),
  }));

describe('hydration planning per message', () => {
  it('downloads a message with two placements once, from its inbox placement', async () => {
    const engine = createTestEngine();
    const { message, inbox, allMail } = await gmailInboxAndAllMail(engine);
    const targets = [await targetOf(engine, allMail), await targetOf(engine, inbox)];
    const fromInbox = candidateIn(message, inbox);

    const plans = [
      planHydration([candidateIn(message, allMail), fromInbox], targets, LIMITS),
      planHydration([fromInbox, candidateIn(message, allMail)], targets, LIMITS),
    ];

    plans.forEach((plan) => {
      expect(planned(plan)).toEqual([
        { path: 'INBOX', candidates: [{ messageId: message.id, uid: fromInbox.uid }] },
      ]);
      expect(plan.oversized).toEqual([]);
    });
  });

  it('prefers a placement with a history target over one without', async () => {
    const engine = createTestEngine();
    const { message, inbox, allMail } = await gmailInboxAndAllMail(engine);
    const targets = [await targetOf(engine, allMail)];
    const fromAllMail = candidateIn(message, allMail);

    const plan = planHydration([candidateIn(message, inbox), fromAllMail], targets, LIMITS);

    expect(planned(plan)).toEqual([
      { path: 'Archive', candidates: [{ messageId: message.id, uid: fromAllMail.uid }] },
    ]);
  });
});
