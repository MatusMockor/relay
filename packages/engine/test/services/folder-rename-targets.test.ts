import type { Label } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { failedActions, folderSetup, scopedRule, syncNow } from '../support/automation-filters';
import { addAutomations, TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { gmailFolders, storedFolder } from '../support/folders';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const labelNamed = async (engine: TestEngine, name: string): Promise<Label> =>
  present((await engine.repositories.labels.list(USER_ID, null)).find((l) => l.name === name));

describe('targets that survive a folder rename', () => {
  it('keeps moving mail into a folder an automation targets after the folder is renamed', async () => {
    const setup = await folderSetup();
    await addAutomations(setup.engine, [
      scopedRule(setup, { actions: [{ type: 'moveTo', mailboxId: setup.folder.id }] }),
    ]);

    await setup.engine.services.folders.update(USER_ID, setup.folder.id, { name: 'Účty' });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 14' });
    await syncNow(setup);

    expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
    expect(setup.server.mailbox('Účty').messages.size).toBe(1);
    expect(failedActions(setup.engine)).toEqual([]);
  });

  it('retargets a queued Gmail label write when the label is renamed from the sidebar', async () => {
    const engine = createTestEngine();
    const seeded = await gmailFolders(engine);
    const parent = await storedFolder(engine, seeded, 'Klienti');
    const acme = await labelNamed(engine, 'Klienti/Acme');
    const thread = present([...engine.db.tables.threads.values()][0]);
    await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'removeLabel',
      labelId: acme.id,
    });
    seeded.server.failOperations = 'Offline';
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'addLabel', labelId: acme.id });
    seeded.server.failOperations = null;

    await engine.services.folders.update(USER_ID, parent.id, { name: 'Zákazníci' });

    const queued = await engine.repositories.pendingWork.list(seeded.account.id, 'provider-op');
    const labels = queued.flatMap(({ payload }) =>
      payload.change.kind === 'label' ? [payload.change.label] : [],
    );
    expect(labels).toContain('Zákazníci/Acme');
    expect(labels).not.toContain('Klienti/Acme');
  });
});
