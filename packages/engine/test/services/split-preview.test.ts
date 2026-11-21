import type { SplitInput, SplitPreviewBody } from '@relay/shared/api';
import { describe, expect, it } from 'vitest';
import { folderSetup, scopedRule, syncNow } from '../support/automation-filters';
import { addAutomations, TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const NOREPLY = { name: 'Firma', email: 'noreply@firma.test' };

const split = (name: string, overrides: Partial<SplitInput> = {}): SplitInput => ({
  accountId: null,
  name,
  order: 0,
  rules: [{ type: 'fromAddress', address: TIBOR.email }],
  exclusive: true,
  hideTasks: false,
  ...overrides,
});

const invoices = (overrides: Partial<SplitPreviewBody> = {}): SplitPreviewBody => ({
  splitId: null,
  accountId: null,
  match: 'any',
  rules: [{ type: 'subjectContains', value: 'faktura' }],
  exceptions: [{ type: 'fromAddress', address: NOREPLY.email }],
  ...overrides,
});

const deliverInvoices = async () => {
  const setup = await folderSetup();
  deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
  deliverMail(setup.server, 'INBOX', { id: 'm2', subject: 'Faktúra 2' });
  deliverMail(setup.server, 'INBOX', { id: 'm3', from: NOREPLY, subject: 'Faktúra noreply' });
  deliverMail(setup.server, 'INBOX', { id: 'm4', from: TIBOR, subject: 'Obed' });
  await syncNow(setup);
  return setup;
};

describe('previewing a split', () => {
  it('counts recent threads the split would show without saving anything', async () => {
    const setup = await deliverInvoices();

    const preview = await setup.engine.services.splits.preview(USER_ID, invoices());

    expect(preview.count).toBe(2);
    expect(preview.days).toBe(30);
    expect(preview.samples.map((sample) => sample.subject).sort()).toEqual([
      'Faktúra 1',
      'Faktúra 2',
    ]);
    expect(preview.overlaps).toEqual([]);
    expect(await setup.engine.services.splits.list(USER_ID)).toEqual([]);
  });

  it('reports threads also caught by an earlier split, never by a later one', async () => {
    const setup = await deliverInvoices();
    const [tibor, , later] = (
      await setup.engine.services.splits.replace(USER_ID, {
        splits: [
          split('Tibor'),
          split('Faktúry', { order: 1, rules: [{ type: 'subjectContains', value: 'faktúra' }] }),
          split('Neskôr', { order: 2 }),
        ],
      })
    ).map(present);
    const own = present((await setup.engine.services.splits.list(USER_ID))[1]);

    const preview = await setup.engine.services.splits.preview(
      USER_ID,
      invoices({ splitId: own.id }),
    );

    expect(preview.overlaps).toEqual([
      { kind: 'split', id: present(tibor).id, name: 'Tibor', count: 1 },
    ]);
    expect(preview.overlaps.some((overlap) => overlap.id === later?.id)).toBe(false);
  });

  it('compares a new split with every saved split', async () => {
    const setup = await deliverInvoices();
    await setup.engine.services.splits.replace(USER_ID, {
      splits: [split('Tibor'), split('Neskôr', { order: 1 })],
    });

    const preview = await setup.engine.services.splits.preview(USER_ID, invoices());

    expect(preview.overlaps.map((overlap) => [overlap.name, overlap.count])).toEqual([
      ['Tibor', 1],
      ['Neskôr', 1],
    ]);
  });

  it('reports enabled automations that archive or move the threads away', async () => {
    const setup = await deliverInvoices();
    await addAutomations(setup.engine, [
      scopedRule(setup, { name: 'Archív Tibor', actions: [{ type: 'archive' }] }),
      scopedRule(setup, {
        name: 'Presun',
        conditions: [{ type: 'subjectContains', value: 'faktúra' }],
        actions: [{ type: 'moveTo', mailboxId: setup.folder.id }],
      }),
      scopedRule(setup, { name: 'Vypnuté', enabled: false, actions: [{ type: 'archive' }] }),
      scopedRule(setup, { name: 'Notifikácia', actions: [{ type: 'notify' }] }),
    ]);

    const preview = await setup.engine.services.splits.preview(USER_ID, invoices());

    expect(preview.overlaps.map((overlap) => [overlap.kind, overlap.name, overlap.count])).toEqual([
      ['automation', 'Archív Tibor', 1],
      ['automation', 'Presun', 2],
    ]);
  });

  it('rejects an invalid exception pattern', async () => {
    const setup = await deliverInvoices();

    await expect(
      setup.engine.services.splits.preview(
        USER_ID,
        invoices({ exceptions: [{ type: 'subjectRegex', pattern: '([', caseSensitive: false }] }),
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});
