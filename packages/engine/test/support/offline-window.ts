import {
  type Mailbox,
  type Message,
  type OfflineWindow,
  offlineWindowCutoff,
} from '@relay/shared/domain';
import type { OfflineBodyOptions, OfflineWindowPolicy } from '../../src';
import { present, type SeededAccount, seedAccount } from './fixtures';
import { backfillUntilDone, seedHistory, storedMessages } from './history';
import type { FakeMailServer, FakeMailServerOptions } from './mail/fake-mail-server';
import { MemoryMessageBodies } from './memory/memory-message-bodies';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from './test-engine';

export class SwitchableWindow implements OfflineWindowPolicy {
  constructor(private value: OfflineWindow) {}

  set(window: OfflineWindow): void {
    this.value = window;
  }

  cutoff(): Promise<Date | null> {
    return Promise.resolve(offlineWindowCutoff(this.value, new Date(TEST_NOW)));
  }
}

export interface OfflineSetup {
  readonly engine: TestEngine;
  readonly seeded: SeededAccount;
  readonly archive: Mailbox;
  readonly window: SwitchableWindow;
}

export const ARCHIVE_SIZE = 48;

export const setupOffline = async (
  initial: OfflineWindow,
  options: Partial<OfflineBodyOptions> = {},
  server: FakeMailServerOptions = {},
  seed: (mail: FakeMailServer) => void = () => undefined,
): Promise<OfflineSetup> => {
  const window = new SwitchableWindow(initial);
  const engine = createTestEngine({
    offlineWindow: window,
    messageBodies: (db) => new MemoryMessageBodies(db),
    offlineBodies: options,
  });
  const seeded = await seedAccount(engine, {}, server);
  seedHistory(seeded.server, 'Archive', ARCHIVE_SIZE);
  seed(seeded.server);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const archive = present(
    await engine.repositories.mailboxes.findByPath(seeded.account.id, 'Archive'),
  );
  return { engine, seeded, archive, window };
};

export const backfillAll = (setup: OfflineSetup) =>
  backfillUntilDone(setup.engine, setup.seeded.account.id, 200);

export const cutoffOf = (window: OfflineWindow): number =>
  offlineWindowCutoff(window, new Date(TEST_NOW))?.getTime() ?? Number.NEGATIVE_INFINITY;

export const olderThan = (engine: TestEngine, window: OfflineWindow): Message[] =>
  storedMessages(engine).filter((message) => Date.parse(message.date) < cutoffOf(window));

export const newerThan = (engine: TestEngine, window: OfflineWindow): Message[] =>
  storedMessages(engine).filter((message) => Date.parse(message.date) >= cutoffOf(window));

export const isRemote = (message: Message): boolean => message.bodyState === 'remote';

export const hasLocalBody = (message: Message): boolean =>
  !isRemote(message) && message.textBody !== null;
