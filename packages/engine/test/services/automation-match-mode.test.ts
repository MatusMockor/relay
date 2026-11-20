import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow, threadBySubject } from '../support/automation-filters';
import {
  addAutomations,
  automationInput,
  notifiedSubjects,
  sync,
  syncedSetup,
  TIBOR,
} from '../support/automations';
import { deliverMail } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const SUPPLIER = { name: 'Dodávateľ', email: 'fakturacia@dodavatel.test' };
const NOREPLY = { name: 'Firma', email: 'noreply@firma.test' };
const COLLEAGUE = { name: 'Kolega', email: 'jana@firma.test' };

describe('automation match mode and exceptions', () => {
  it('fires a rule when any condition matches and no exception does', async () => {
    const setup = await syncedSetup();
    await addAutomations(setup.engine, [
      automationInput({
        name: 'Dodávatelia',
        match: 'any',
        conditions: [
          { type: 'fromDomain', domain: 'dodavatel.test' },
          { type: 'fromDomain', domain: 'firma.test' },
        ],
        exceptions: [{ type: 'fromAddress', address: NOREPLY.email }],
      }),
    ]);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: SUPPLIER, subject: 'Faktúra 11' });
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: COLLEAGUE, subject: 'Porada' });
    deliverMail(setup.server, 'INBOX', { id: 'm3', from: NOREPLY, subject: 'Newsletter' });
    deliverMail(setup.server, 'INBOX', { id: 'm4', from: TIBOR, subject: 'Obed' });

    await sync(setup);

    expect(notifiedSubjects(setup.engine).sort()).toEqual(['Faktúra 11', 'Porada']);
  });

  it('matches the subject ignoring case and diacritics in live mail', async () => {
    const setup = await syncedSetup();
    await addAutomations(setup.engine, [
      automationInput({
        name: 'Faktúry',
        conditions: [{ type: 'subjectContains', value: 'faktura' }],
      }),
    ]);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Nová FAKTÚRA 7' });
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: TIBOR, subject: 'Objednávka 7' });

    await sync(setup);

    expect(notifiedSubjects(setup.engine)).toEqual(['Nová FAKTÚRA 7']);
  });

  it('skips existing mail that matches an exception when applied to existing mail', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: SUPPLIER, subject: 'Faktúra 1' });
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: NOREPLY, subject: 'Faktúra 2' });
    await syncNow(setup);
    const rule = await saveRule(setup, {
      conditions: [{ type: 'subjectContains', value: 'faktúra' }],
      exceptions: [{ type: 'fromAddress', address: NOREPLY.email }],
      actions: [{ type: 'markRead' }],
    });

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 1, applied: 1, failed: 0 });

    expect(threadBySubject(setup.engine, 'Faktúra 1').unread).toBe(false);
    expect(threadBySubject(setup.engine, 'Faktúra 2').unread).toBe(true);
  });

  it('keeps the stored match mode and exceptions when an older client omits them', async () => {
    const setup = await syncedSetup();
    const saved = await addAutomations(setup.engine, [
      automationInput({
        name: 'Dodávatelia',
        match: 'any',
        conditions: [
          { type: 'fromDomain', domain: 'dodavatel.test' },
          { type: 'fromDomain', domain: 'firma.test' },
        ],
        exceptions: [{ type: 'fromAddress', address: NOREPLY.email }],
      }),
    ]);
    const legacy = saved.map(({ match: _match, exceptions: _exceptions, ...rest }) => ({
      ...rest,
      name: rest.name === 'Dodávatelia' ? 'Dodávatelia 2' : rest.name,
    }));
    const {
      match: _match,
      exceptions: _exceptions,
      ...fresh
    } = automationInput({
      name: 'Nové',
    });

    const replaced = await setup.engine.services.automations.replace(USER_ID, {
      automations: [...legacy, fresh],
    });

    expect(replaced.find((rule) => rule.name === 'Dodávatelia 2')).toMatchObject({
      match: 'any',
      exceptions: [{ type: 'fromAddress', address: NOREPLY.email }],
    });
    expect(replaced.find((rule) => rule.name === 'Nové')).toMatchObject({
      match: 'all',
      exceptions: [],
    });
  });
});
