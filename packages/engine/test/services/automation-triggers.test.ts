import { describe, expect, it } from 'vitest';
import {
  addAutomations,
  automationInput,
  JIRA,
  notifiedSubjects,
  sync,
  syncedSetup,
  TIBOR,
} from '../support/automations';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('automation triggers', () => {
  it('requires every condition, including the Jira event kind, to match', async () => {
    const setup = await syncedSetup();
    await addAutomations(setup.engine, [
      automationInput({
        name: 'Spomenutia v Jire',
        conditions: [
          { type: 'jira', projectKeys: ['EF'] },
          { type: 'jiraEvent', kind: 'mention' },
        ],
      }),
      automationInput({
        name: 'Tibor o ponuke',
        conditions: [
          { type: 'fromDomain', domain: 'efabrica.test' },
          { type: 'subjectRegex', pattern: '^ponuka', caseSensitive: false },
          { type: 'header', name: 'X-Priority', pattern: '^1' },
        ],
      }),
    ]);
    deliverMail(setup.server, 'INBOX', {
      id: 'm1',
      from: JIRA,
      subject: '[EF-12] Platobná brána',
      headers: { 'X-Jira-Event': 'mention' },
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'm2',
      from: JIRA,
      subject: '[EF-13] Presun do sprintu',
      headers: { 'X-Jira-Event': 'status' },
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'm3',
      from: JIRA,
      subject: '[OPS-1] Iný projekt',
      headers: { 'X-Jira-Event': 'mention' },
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'm4',
      from: TIBOR,
      subject: 'Ponuka na jar',
      headers: { 'X-Priority': '1 (Highest)' },
    });
    deliverMail(setup.server, 'INBOX', { id: 'm5', from: TIBOR, subject: 'Ponuka bez priority' });

    await sync(setup);

    expect(notifiedSubjects(setup.engine)).toHaveLength(2);
    expect(notifiedSubjects(setup.engine)).toEqual(
      expect.arrayContaining(['[EF-12] Platobná brána', 'Ponuka na jar']),
    );
  });

  it('never runs on the initial sync backlog', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    await addAutomations(engine, [automationInput()]);
    deliverMail(server, 'INBOX', { id: 'old', from: TIBOR, subject: 'Stará pošta' });

    await engine.services.sync.syncAccount(USER_ID, account.id);
    deliverMail(server, 'INBOX', { id: 'new', from: TIBOR, subject: 'Nová pošta' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(notifiedSubjects(engine)).toEqual(['Nová pošta']);
  });

  it('skips disabled rules and rules for another account', async () => {
    const setup = await syncedSetup();
    const other = await seedAccount(setup.engine, { email: 'bob@example.com', isPrimary: false });
    await addAutomations(setup.engine, [
      automationInput({ name: 'Vypnuté', enabled: false }),
      automationInput({ name: 'Iný účet', accountId: other.account.id }),
    ]);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Ahoj' });

    await sync(setup);

    expect(notifiedSubjects(setup.engine)).toEqual([]);
  });

  it('runs a rule for an account it is scoped to', async () => {
    const setup = await syncedSetup();
    await addAutomations(setup.engine, [automationInput({ accountId: setup.account.id })]);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Ahoj' });

    await sync(setup);

    expect(notifiedSubjects(setup.engine)).toEqual(['Ahoj']);
  });

  it('triggers an automation only once per message', async () => {
    const setup = await syncedSetup();
    const [, saved] = await addAutomations(setup.engine, [automationInput()]);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Raz' });
    await sync(setup);
    const message = [...setup.engine.db.tables.messages.values()].find(
      (item) => item.subject === 'Raz',
    );

    const replayed = await setup.engine.repositories.automationRuns.claim({
      userId: USER_ID,
      automationId: saved?.id ?? ('missing' as never),
      messageId: message?.id ?? ('missing' as never),
      createdAt: setup.engine.clock.now().toISOString(),
    });
    await sync(setup);

    expect(replayed).toBe(false);
    expect(notifiedSubjects(setup.engine)).toEqual(['Raz']);
  });

  it('ignores mail that is not new in the inbox', async () => {
    const setup = await syncedSetup();
    await addAutomations(setup.engine, [automationInput()]);
    deliverMail(setup.server, 'Sent', { id: 's1', from: TIBOR, subject: 'Odoslané' });

    await sync(setup);

    expect(notifiedSubjects(setup.engine)).toEqual([]);
  });
});
