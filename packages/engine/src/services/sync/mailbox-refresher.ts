import type { Mailbox } from '@relay/shared/domain';
import type { IdGenerator } from '../../ports/id-generator';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MessageRepository } from '../../ports/message-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { SyncContext } from './sync-context';

export interface MailboxRefresherDeps {
  readonly mailboxes: MailboxRepository;
  readonly messages: MessageRepository;
  readonly syncStates: SyncStateRepository;
  readonly unitOfWork: UnitOfWork;
  readonly ids: IdGenerator;
}

export class MailboxRefresher {
  constructor(private readonly deps: MailboxRefresherDeps) {}

  async refresh(context: SyncContext): Promise<Mailbox[]> {
    const accountId = context.account.id;
    const existing = await this.deps.mailboxes.listForSync(accountId);
    const remote = await context.provider.listMailboxes();
    const remotePaths = new Set(remote.map((mailbox) => mailbox.path));
    for (const gone of existing.filter((mailbox) => !remotePaths.has(mailbox.path))) {
      await this.forget(context, gone);
    }
    const byPath = new Map(existing.map((mailbox) => [mailbox.path, mailbox]));
    const stored = await this.deps.mailboxes.upsertMany(
      accountId,
      remote.map((mailbox) => {
        const known = byPath.get(mailbox.path);
        return {
          id: known?.id ?? this.deps.ids.generate('mailbox'),
          accountId,
          name: mailbox.name,
          path: mailbox.path,
          delimiter: mailbox.delimiter,
          role: mailbox.role,
          unreadCount: known?.unreadCount ?? 0,
          totalCount: known?.totalCount ?? 0,
        };
      }),
    );
    const appeared = await this.appearedSince(context, existing, remotePaths);
    await this.deps.mailboxes.deleteMissing(accountId, [
      ...remotePaths,
      ...appeared.map((mailbox) => mailbox.path),
    ]);
    const current = [...stored, ...appeared];
    context.mailboxRoles.clear();
    current.forEach((mailbox) => context.mailboxRoles.set(mailbox.id, mailbox.role));
    return current;
  }

  private async appearedSince(
    context: SyncContext,
    snapshot: readonly Mailbox[],
    remotePaths: ReadonlySet<string>,
  ): Promise<Mailbox[]> {
    const known = new Set(snapshot.map((mailbox) => mailbox.path));
    const latest = await this.deps.mailboxes.listForSync(context.account.id);
    return latest.filter((mailbox) => !known.has(mailbox.path) && !remotePaths.has(mailbox.path));
  }

  private async forget(context: SyncContext, mailbox: Mailbox): Promise<void> {
    const uids = await this.deps.messages.listUids(mailbox.id);
    await this.deps.unitOfWork.run(async (repositories) => {
      const threadIds = await repositories.messages.deleteByUids(mailbox.id, uids);
      await context.journal.expunged(repositories.pendingWork, threadIds, mailbox.role);
    });
    await this.deps.syncStates.delete(mailbox.id);
  }
}
