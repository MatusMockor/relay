import type { AutomationPreviewBody } from '@relay/shared/api';
import { AccountIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { folderSetup, syncNow } from '../support/automation-filters';
import { TIBOR } from '../support/automations';
import { deliverMail, ME } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const NOREPLY = { name: 'Firma', email: 'noreply@firma.test' };

const invoices = (overrides: Partial<AutomationPreviewBody> = {}): AutomationPreviewBody => ({
  accountId: null,
  match: 'all',
  conditions: [{ type: 'subjectContains', value: 'faktura' }],
  exceptions: [{ type: 'fromAddress', address: NOREPLY.email }],
  ...overrides,
});

describe('previewing a draft automation', () => {
  it('counts received mail of the last 30 days that the draft would catch', async () => {
    const setup = await folderSetup();
    const { server } = setup;
    deliverMail(server, 'INBOX', {
      id: 'm1',
      from: TIBOR,
      subject: 'Faktúra 1',
      date: '2026-11-14T08:00:00.000Z',
    });
    deliverMail(server, 'Faktúry', {
      id: 'm2',
      from: TIBOR,
      subject: 'FAKTÚRA 2',
      date: '2026-11-15T08:00:00.000Z',
    });
    deliverMail(server, 'INBOX', {
      id: 'm3',
      from: TIBOR,
      subject: 'Faktúra stará',
      date: '2026-09-01T08:00:00.000Z',
    });
    deliverMail(server, 'INBOX', { id: 'm4', from: NOREPLY, subject: 'Faktúra noreply' });
    deliverMail(server, 'Sent', { id: 'm5', from: ME, subject: 'Faktúra odoslaná' });
    deliverMail(server, 'Junk', { id: 'm6', from: TIBOR, subject: 'Faktúra spam' });
    deliverMail(server, 'INBOX', { id: 'm7', from: TIBOR, subject: 'Obed' });
    await syncNow(setup);

    const preview = await setup.engine.services.automations.preview(USER_ID, invoices());

    expect(preview.days).toBe(30);
    expect(preview.count).toBe(2);
    expect(preview.samples.map((sample) => [sample.subject, sample.from?.email])).toEqual([
      ['FAKTÚRA 2', TIBOR.email],
      ['Faktúra 1', TIBOR.email],
    ]);
    expect(preview.samples[0]).toMatchObject({
      accountId: setup.account.id,
      date: '2026-11-15T08:00:00.000Z',
    });
  });

  it('honors the any match mode without saving anything', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Obed' });
    deliverMail(setup.server, 'INBOX', { id: 'm2', subject: 'Faktúra 3' });
    deliverMail(setup.server, 'INBOX', { id: 'm3', subject: 'Porada' });
    await syncNow(setup);
    const before = await setup.engine.services.automations.list(USER_ID);

    const preview = await setup.engine.services.automations.preview(
      USER_ID,
      invoices({
        accountId: setup.account.id,
        match: 'any',
        conditions: [
          { type: 'fromAddress', address: TIBOR.email },
          { type: 'subjectContains', value: 'faktúra' },
        ],
        exceptions: [],
      }),
    );

    expect(preview.count).toBe(2);
    expect(await setup.engine.services.automations.list(USER_ID)).toEqual(before);
  });

  it('rejects an unknown account and an invalid pattern', async () => {
    const setup = await folderSetup();
    const preview = (body: AutomationPreviewBody) =>
      setup.engine.services.automations.preview(USER_ID, body);

    await expect(
      preview(invoices({ accountId: AccountIdSchema.parse('acc_missing') })),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      preview(
        invoices({ conditions: [{ type: 'subjectRegex', pattern: '(', caseSensitive: false }] }),
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});
