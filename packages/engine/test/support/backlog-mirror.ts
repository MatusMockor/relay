import { type FolderSetup, folderSetup, syncNow } from './automation-filters';
import { TIBOR } from './automations';
import { deliverMail } from './fixtures';

export const INVOICES = ['Faktúra 1', 'Faktúra 2', 'Faktúra 3', 'Faktúra 4', 'Faktúra 5'];

export const invoiceSetup = async (
  subjects: readonly string[] = INVOICES,
): Promise<FolderSetup> => {
  const setup = await folderSetup();
  subjects.forEach((subject, index) =>
    deliverMail(setup.server, 'INBOX', { id: `m${index + 1}`, from: TIBOR, subject }),
  );
  await syncNow(setup);
  return setup;
};

export const pendingOps = (setup: FolderSetup) =>
  setup.engine.repositories.pendingWork.list(setup.account.id, 'provider-op');

export const countWrites = (setup: FolderSetup): { moves: number; flags: number } => {
  const writes = { moves: 0, flags: 0 };
  setup.server.afterMove = () => {
    writes.moves += 1;
  };
  setup.server.beforeFlagWrite = () => {
    writes.flags += 1;
    return Promise.resolve();
  };
  return writes;
};
