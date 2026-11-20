import { randomUUID } from 'node:crypto';
import type { AccountId } from '@relay/shared/domain';
import type {
  PendingWork,
  PendingWorkInput,
  PendingWorkKey,
  PendingWorkKind,
  PendingWorkPayloads,
  PendingWorkRepository,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

const keyOf = (key: PendingWorkKey): string => JSON.stringify([key.accountId, key.kind, key.ref]);

export class MemoryPendingWorkRepository implements PendingWorkRepository {
  failPut: string | null = null;
  failPutAfter: number | null = null;
  failListByKind: string | null = null;

  constructor(private readonly db: MemoryDatabase) {}

  put<Kind extends PendingWorkKind>(work: PendingWorkInput<Kind>): Promise<PendingWork<Kind>> {
    if (this.failPut !== null) {
      return Promise.reject(new Error(this.failPut));
    }
    if (this.failPutAfter === 0) {
      return Promise.reject(new Error('database is locked'));
    }
    if (this.failPutAfter !== null) {
      this.failPutAfter -= 1;
    }
    const key = keyOf(work);
    const stored: PendingWork<Kind> = { ...structuredClone(work), revision: randomUUID() };
    this.db.tables.pendingWork.set(key, stored);
    return Promise.resolve(stored);
  }

  replace<Kind extends PendingWorkKind>(
    work: PendingWork<Kind>,
    payload: PendingWorkPayloads[Kind],
  ): Promise<PendingWork<Kind> | null> {
    const key = keyOf(work);
    if (this.db.tables.pendingWork.get(key)?.revision !== work.revision) {
      return Promise.resolve(null);
    }
    const stored: PendingWork<Kind> = {
      ...structuredClone(work),
      payload: structuredClone(payload),
      revision: randomUUID(),
    };
    this.db.tables.pendingWork.set(key, stored);
    return Promise.resolve(stored);
  }

  find<Kind extends PendingWorkKind>(key: PendingWorkKey<Kind>): Promise<PendingWork<Kind> | null> {
    const stored = this.db.tables.pendingWork.get(keyOf(key));
    return Promise.resolve(stored === undefined ? null : (stored as PendingWork<Kind>));
  }

  list<Kind extends PendingWorkKind>(
    accountId: AccountId,
    kind: Kind,
  ): Promise<PendingWork<Kind>[]> {
    const matches = [...this.db.tables.pendingWork.values()]
      .filter((work) => work.accountId === accountId && work.kind === kind)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.ref.localeCompare(b.ref));
    return Promise.resolve(matches as PendingWork<Kind>[]);
  }

  listByKind<Kind extends PendingWorkKind>(kind: Kind): Promise<PendingWork<Kind>[]> {
    if (this.failListByKind !== null) {
      return Promise.reject(new Error(this.failListByKind));
    }
    const matches = [...this.db.tables.pendingWork.values()]
      .filter((work) => work.kind === kind)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.ref.localeCompare(b.ref));
    return Promise.resolve(matches as PendingWork<Kind>[]);
  }

  remove(works: readonly PendingWork[]): Promise<number> {
    const removed = works.filter((work) => {
      const key = keyOf(work);
      if (this.db.tables.pendingWork.get(key)?.revision !== work.revision) {
        return false;
      }
      return this.db.tables.pendingWork.delete(key);
    });
    return Promise.resolve(removed.length);
  }
}
