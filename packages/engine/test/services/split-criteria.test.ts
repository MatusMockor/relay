import type { SplitInput } from '@relay/shared/api';
import { type SplitRule, supportedSplits } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { threadBySubject } from '../support/automation-filters';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const PARTNER = { name: 'Peter Kral', email: 'peter@partner.test' };
const fromPartner: SplitRule = { type: 'fromDomain', domain: 'partner.test' };
const ccAccounting: SplitRule = {
  type: 'recipient',
  field: 'cc',
  match: 'domain',
  value: 'uctovnictvo.test',
};

const clients = (overrides: Partial<SplitInput> = {}): SplitInput => ({
  accountId: null,
  name: 'Klienti',
  order: 0,
  rules: [fromPartner],
  exclusive: true,
  hideTasks: false,
  ...overrides,
});

const deliverSamples = async (engine: TestEngine) => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', {
    id: 'a1',
    from: PARTNER,
    subject: 'Faktúra s kópiou',
    headers: { Cc: 'kniha@uctovnictvo.test', 'X-Test-Calendar': 'invite-a1' },
  });
  deliverMail(server, 'INBOX', { id: 'a2', from: PARTNER, subject: 'Faktúra bez kópie' });
  deliverMail(server, 'INBOX', {
    id: 'a3',
    from: PARTNER,
    subject: 'Newsletter s kópiou',
    headers: { Cc: 'kniha@uctovnictvo.test' },
  });
  return { account, server };
};

const membersOf = (engine: TestEngine, subjects: readonly string[]): number[] =>
  subjects.map((subject) => threadBySubject(engine, subject).splitIds.length);

const SUBJECTS = ['Faktúra s kópiou', 'Faktúra bez kópie', 'Newsletter s kópiou'];

const strictClients = clients({
  match: 'all',
  rules: [fromPartner, ccAccounting],
  exceptions: [{ type: 'subjectContains', value: 'NEWSLETTER' }],
});

describe('split conditions', () => {
  it('stores a new split with the any mode and no exceptions by default', async () => {
    const engine = createTestEngine();

    const [stored] = await engine.services.splits.replace(USER_ID, { splits: [clients()] });

    expect(stored).toMatchObject({ match: 'any', exceptions: [] });
  });

  it('keeps the stored mode and exceptions when an older client omits them', async () => {
    const engine = createTestEngine();
    const [saved] = await engine.services.splits.replace(USER_ID, { splits: [strictClients] });

    const [renamed] = await engine.services.splits.replace(USER_ID, {
      splits: [clients({ id: saved?.id, name: 'Partneri', rules: [fromPartner, ccAccounting] })],
    });

    expect(renamed).toMatchObject({
      id: saved?.id,
      name: 'Partneri',
      match: 'all',
      exceptions: [{ type: 'subjectContains', value: 'NEWSLETTER' }],
    });
  });

  it('keeps a split passed as kept and renumbers the order', async () => {
    const engine = createTestEngine();
    const [first, second] = (
      await engine.services.splits.replace(USER_ID, {
        splits: [strictClients, clients({ name: 'Jira', order: 1 })],
      })
    ).map(present);

    const stored = await engine.services.splits.replace(USER_ID, {
      splits: [
        clients({ id: present(second).id, name: 'Jira', order: 0 }),
        { id: present(first).id, keep: true },
      ],
    });

    expect(supportedSplits(stored).map((split) => [split.name, split.order, split.match])).toEqual([
      ['Jira', 0, 'any'],
      ['Klienti', 1, 'all'],
    ]);
  });

  it('classifies new mail with the match mode, recipients, attachments and exceptions', async () => {
    const engine = createTestEngine();
    await engine.services.splits.replace(USER_ID, { splits: [strictClients] });
    const { account } = await deliverSamples(engine);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(membersOf(engine, SUBJECTS)).toEqual([1, 0, 0]);
  });

  it('re-evaluates stored mail with the same semantics as new mail', async () => {
    const engine = createTestEngine();
    const { account } = await deliverSamples(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    await engine.services.splits.replace(USER_ID, {
      splits: [
        clients({
          match: 'all',
          rules: [fromPartner, { type: 'hasAttachment' }],
          exceptions: [{ type: 'subjectContains', value: 'newsletter' }],
        }),
      ],
    });
    const attached = membersOf(engine, SUBJECTS);
    await engine.services.splits.replace(USER_ID, { splits: [strictClients] });

    expect(attached).toEqual([1, 0, 0]);
    expect(membersOf(engine, SUBJECTS)).toEqual([1, 0, 0]);
  });

  it('rejects an invalid pattern in an exception', async () => {
    const engine = createTestEngine();

    await expect(
      engine.services.splits.replace(USER_ID, {
        splits: [
          clients({ exceptions: [{ type: 'subjectRegex', pattern: '([', caseSensitive: false }] }),
        ],
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});
