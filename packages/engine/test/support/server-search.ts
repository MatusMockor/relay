import type { ServerSearchRequest, ServerSearchResponse } from '@relay/shared/api';
import type { OfflineWindowPolicy, SearchOptions } from '../../src';
import { deliverMail, type SeededAccount, seedAccount } from './fixtures';
import { historyDate } from './history';
import type { MemoryDatabase } from './memory/memory-database';
import { MemoryMessageBodies } from './memory/memory-message-bodies';
import { createTestEngine, type TestEngine, USER_ID } from './test-engine';

export interface ServerSearchSetup {
  readonly engine: TestEngine;
  readonly seeded: SeededAccount;
}

export interface ServerSearchSetupOptions {
  readonly search?: Partial<SearchOptions>;
  readonly offlineWindow?: OfflineWindowPolicy;
  readonly offlineBodies?: boolean;
  readonly seed?: (seeded: SeededAccount) => void;
}

export const setupServerSearch = async (
  options: ServerSearchSetupOptions = {},
): Promise<ServerSearchSetup> => {
  const engine = createTestEngine({
    search: options.search,
    offlineWindow: options.offlineWindow,
    ...(options.offlineBodies === true
      ? { messageBodies: (db: MemoryDatabase) => new MemoryMessageBodies(db) }
      : {}),
    receivedAttachments: true,
  });
  const seeded = await seedAccount(engine);
  deliverMail(seeded.server, 'Archive', {
    id: 'old-invoice',
    subject: 'Ročné vyúčtovanie',
    date: historyDate(10, 100),
    body: 'V prílohe posielam faktúru za kôň a voz.',
  });
  deliverMail(seeded.server, 'Archive', {
    id: 'old-lunch',
    subject: 'Obed',
    date: historyDate(20, 100),
    body: 'Ideme na obed?',
  });
  deliverMail(seeded.server, 'INBOX', {
    id: 'fresh-invoice',
    subject: 'Nová faktúra',
    body: 'Posielam faktúru za október.',
  });
  options.seed?.(seeded);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  return { engine, seeded };
};

let requests = 0;

export const searchServer = (
  engine: TestEngine,
  q: string,
  extra: Partial<ServerSearchRequest> = {},
): Promise<ServerSearchResponse> => {
  requests += 1;
  return engine.services.search.search(USER_ID, {
    requestId: `search-${String(requests)}`,
    q,
    ...extra,
  });
};

export interface Gate {
  readonly reached: Promise<void>;
  release(): void;
}

export const gateTextSearch = (seeded: SeededAccount, path: string): Gate => {
  let reach: () => void = () => undefined;
  let release: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  seeded.server.beforeTextSearch = (searched) => {
    if (searched !== path) {
      return Promise.resolve();
    }
    seeded.server.beforeTextSearch = null;
    reach();
    return released;
  };
  return { reached, release };
};

export const subjectsOf = (response: ServerSearchResponse): string[] =>
  response.hits.map((hit) => hit.thread.subject);
