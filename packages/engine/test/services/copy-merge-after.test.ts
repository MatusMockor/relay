import type { Message, MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { recordProviderOps } from '../../src/services/shared/provider-ops';
import { addAutomations, automationInput, notifiedSubjects, TIBOR } from '../support/automations';
import {
  enqueueCopyMerge,
  expectMergeInvariants,
  pendingOfKind,
  storedMessages,
} from '../support/copy-merge';
import { deliverMail, present } from '../support/fixtures';
import {
  type LegacyPair,
  type LegacySpec,
  mailboxAt,
  seedLegacyDuplicates,
} from '../support/legacy-duplicates';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const SPEC: LegacySpec = {
  id: 'n1',
  subject: 'Ponuka od Tibora',
  from: TIBOR,
  date: '2026-11-14T08:00:00.000Z',
};

type Prepare = (engine: TestEngine, pair: LegacyPair) => Promise<void>;

const mergedSetup = async (prepare: Prepare = () => Promise.resolve()) => {
  const engine = createTestEngine();
  const seeded = await seedLegacyDuplicates(engine, [SPEC]);
  const pair = present(seeded.pairs[0]);
  await prepare(engine, pair);
  await enqueueCopyMerge(engine, seeded.account.id);
  const syncNow = () => engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  await syncNow();
  await syncNow();
  const keeper = (): Message => present(engine.db.tables.messages.get(pair.keeperId));
  const act = (type: 'archive' | 'trash' | 'restore') =>
    engine.services.actions.apply(USER_ID, keeper().threadId, { type });
  return { engine, ...seeded, pair, keeper, syncNow, act };
};

const roles = async (engine: TestEngine, message: Message) => {
  const mailboxes = await Promise.all(
    message.placements.map((placement) =>
      engine.repositories.mailboxes.findById(placement.mailboxId),
    ),
  );
  return mailboxes.map((mailbox) => present(mailbox).role).sort();
};

describe('sync after the copy merge', () => {
  it('stores new Gmail mail once', async () => {
    const { engine, server, syncNow } = await mergedSetup();
    deliverMail(server, 'INBOX', { id: 'fresh', subject: 'Nová', date: TEST_NOW });

    await syncNow();

    const fresh = storedMessages(engine).filter((message) => message.subject === 'Nová');
    expect(fresh).toHaveLength(1);
    expect(await roles(engine, present(fresh[0]))).toEqual(['archive', 'inbox']);
    expectMergeInvariants(engine);
  });

  it('archives, trashes and restores the merged message as one message', async () => {
    const { engine, server, keeper, syncNow, act } = await mergedSetup();

    await act('archive');
    await syncNow();
    expect(storedMessages(engine)).toHaveLength(1);
    expect(await roles(engine, keeper())).toEqual(['archive']);
    expect(server.mailbox('INBOX').messages.size).toBe(0);

    await act('trash');
    await syncNow();
    expect(storedMessages(engine)).toHaveLength(1);
    expect(await roles(engine, keeper())).toEqual(['trash']);

    await act('restore');
    await syncNow();
    expect(storedMessages(engine)).toHaveLength(1);
    expect(await roles(engine, keeper())).toEqual(['archive']);
    expect(server.mailbox('Trash').messages.size).toBe(0);
    expect(pendingOfKind(engine, 'provider-op')).toEqual([]);
    expectMergeInvariants(engine);
  });

  it('reflects a flag change made on the web', async () => {
    const { server, keeper, syncNow } = await mergedSetup();
    server.updateFlags('INBOX', keeper().uid, { seen: true, flagged: true });

    await syncNow();

    expect(keeper().flags).toEqual({ seen: true, flagged: true, answered: false });
  });

  it('serves stale loser ids through the alias and replays their ops on the keeper', async () => {
    const { engine, account, server, pair, keeper, syncNow } = await mergedSetup();
    const loserId: MessageId = pair.loserId;
    const body = await engine.services.bodies.get(USER_ID, loserId);
    expect(body).toMatchObject({ status: 'local', textBody: keeper().textBody });
    await recordProviderOps(
      engine.repositories.pendingWork,
      account.id,
      [{ messageId: loserId, change: { kind: 'flag', flag: 'flagged', value: true } }],
      TEST_NOW,
    );

    await syncNow();

    expect(server.record('INBOX', keeper().uid).flags.flagged).toBe(true);
    expect(pendingOfKind(engine, 'provider-op')).toEqual([]);
  });

  it('does not re-run an automation when the merged message is re-inboxed on the web', async () => {
    const { engine, account, server, pair, syncNow, act } = await mergedSetup(
      async (engine, { loserId }) => {
        const rules = await addAutomations(engine, [automationInput({ name: 'Tibor' })]);
        const rule = present(rules.find((automation) => automation.name === 'Tibor'));
        await engine.repositories.automationRuns.claim({
          userId: USER_ID,
          automationId: rule.id,
          messageId: loserId,
          createdAt: TEST_NOW,
        });
      },
    );
    expect([...engine.db.tables.automationRuns]).toEqual([
      expect.stringMatching(new RegExp(`:${pair.keeperId}$`)),
    ]);
    await act('archive');
    await syncNow();
    const inbox = await mailboxAt(engine, account, 'INBOX');
    deliverMail(server, inbox.path, SPEC);
    deliverMail(server, inbox.path, { id: 'n2', subject: 'Nová od Tibora', from: TIBOR });

    await syncNow();

    expect(notifiedSubjects(engine)).toEqual(['Nová od Tibora']);
  });
});
