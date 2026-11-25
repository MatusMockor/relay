import { describe, expect, it } from 'vitest';
import { type FolderSetup, folderSetup, saveRule, syncNow } from '../support/automation-filters';
import { TIBOR } from '../support/automations';
import { countWrites, pendingOps } from '../support/backlog-mirror';
import { deliverMail } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const BATCH_SIZE = 4;
const THREADS = 5;
const MESSAGES = THREADS * 2;

const conversationSetup = async (): Promise<FolderSetup> => {
  const setup = await folderSetup({ actions: { providerBatchSize: BATCH_SIZE } });
  for (let index = 1; index <= THREADS; index += 1) {
    const subject = `Faktúra ${index}`;
    deliverMail(setup.server, 'INBOX', { id: `m${index}`, from: TIBOR, subject });
    deliverMail(setup.server, 'INBOX', {
      id: `r${index}`,
      from: TIBOR,
      subject: `Re: ${subject}`,
      inReplyTo: `m${index}`,
    });
  }
  await syncNow(setup);
  return setup;
};

const archiveAll = async (setup: FolderSetup) => {
  const rule = await saveRule(setup, { actions: [{ type: 'markRead' }, { type: 'archive' }] });
  return setup.engine.services.automations.applyToExisting(USER_ID, rule.id);
};

const expectAllArchived = async (setup: FolderSetup): Promise<void> => {
  expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
  const archived = [...setup.server.mailbox('Archive').messages.values()];
  expect(archived).toHaveLength(MESSAGES);
  expect(archived.every((record) => record.flags.seen)).toBe(true);
  await expect(pendingOps(setup)).resolves.toEqual([]);
};

describe('provider op batches over the batch size', () => {
  it('splits the writes of a large apply into commands of at most the batch size', async () => {
    const setup = await conversationSetup();
    const connections = setup.server.connections;
    const writes = countWrites(setup);

    await expect(archiveAll(setup)).resolves.toEqual({
      matched: THREADS,
      applied: THREADS,
      failed: 0,
    });

    expect(setup.server.connections - connections).toBe(1);
    expect(writes).toEqual({ moves: 3, flags: 3 });
    await expectAllArchived(setup);
  });

  it('splits pending ops replayed by the next sync the same way', async () => {
    const setup = await conversationSetup();
    setup.server.failConnect = 'Connection refused';
    await archiveAll(setup);
    await expect(pendingOps(setup)).resolves.toHaveLength(MESSAGES * 2);
    setup.server.failConnect = null;
    const writes = countWrites(setup);

    await syncNow(setup);

    expect(writes).toEqual({ moves: 3, flags: 3 });
    await expectAllArchived(setup);
  });
});
