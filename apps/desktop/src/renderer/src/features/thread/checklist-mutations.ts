import type { ChecklistItem, ThreadId } from '@relay/shared';
import type { MailClient } from '../../data/MailClient';

interface PendingItem {
  version: number;
  saved: boolean;
  pending: number;
  queue: Promise<void>;
}

export type ChecklistRollback = (done: boolean, error: unknown) => void;

export class ChecklistMutations {
  private readonly items = new Map<string, PendingItem>();

  constructor(private readonly client: Pick<MailClient, 'updateChecklistItem'>) {}

  toggle(threadId: ThreadId, item: ChecklistItem, rollback: ChecklistRollback): boolean {
    const key = `${threadId}\u0000${item.id}`;
    const entry = this.items.get(key) ?? {
      version: 0,
      saved: item.done,
      pending: 0,
      queue: Promise.resolve(),
    };
    this.items.set(key, entry);
    entry.version += 1;
    entry.pending += 1;
    const version = entry.version;
    const done = !item.done;
    entry.queue = entry.queue.then(async () => {
      try {
        await this.client.updateChecklistItem(threadId, { itemId: item.id, done });
        entry.saved = done;
      } catch (error) {
        if (entry.version === version) {
          rollback(entry.saved, error);
        }
      } finally {
        entry.pending -= 1;
        if (entry.pending === 0) {
          this.items.delete(key);
        }
      }
    });
    return done;
  }

  get size(): number {
    return this.items.size;
  }
}

const registry = new WeakMap<object, ChecklistMutations>();

export const checklistMutationsFor = (client: MailClient): ChecklistMutations => {
  const existing = registry.get(client);
  if (existing !== undefined) {
    return existing;
  }
  const created = new ChecklistMutations(client);
  registry.set(client, created);
  return created;
};
