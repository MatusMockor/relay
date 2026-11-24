import { describe, expect, it } from 'vitest';
import { failedActions, threadBySubject } from '../support/automation-filters';
import { addAutomations, automationInput, TIBOR } from '../support/automations';
import { deliverMail, ME, present, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

describe('automation addLabel on Gmail', () => {
  it('labels new mail through X-GM-LABELS once per message', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(
      engine,
      { settings: GMAIL_SETTINGS },
      { gmail: true },
    );
    server.addMailbox('Klienti', 'label', 501);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const label = present(
      await engine.repositories.labels.findByRemoteName(account.id, 'gmail', 'Klienti'),
    );
    await addAutomations(engine, [
      automationInput({
        accountId: account.id,
        name: 'Klienti',
        actions: [{ type: 'addLabel', labelId: label.id }],
      }),
    ]);
    deliverMail(server, 'INBOX', {
      id: 'g1',
      from: TIBOR,
      subject: 'Faktúra 12',
      labels: ['\\Inbox'],
      emailId: 'gm-1',
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(failedActions(engine)).toEqual([]);
    expect(server.labelWrites).toEqual([
      { path: 'Archive', uids: [1], add: ['Klienti'], remove: [] },
    ]);
    expect(server.record('INBOX', 1).labels).toEqual(['\\Inbox', 'Klienti']);
    expect(threadBySubject(engine, 'Faktúra 12').labelIds).toEqual([label.id]);
  });
});
