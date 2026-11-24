import type { AccountId, CopyMergeResolveCursor, Mailbox } from '@relay/shared/domain';
import { UidValidityChangedError } from '../../../errors';
import type { RemoteEmailId } from '../../../model/remote-mail';
import type { MailboxSyncState } from '../../../model/sync-state';
import type { EmailIdResolutions, ResolvedEmailId } from '../../../ports/email-id-resolutions';
import type { Logger } from '../../../ports/logger';
import type { SyncStateRepository } from '../../../ports/sync-state-repository';
import type { SyncContext } from '../sync-context';

export interface EmailIdResolverDeps {
  readonly resolutions: EmailIdResolutions;
  readonly syncStates: SyncStateRepository;
  readonly logger: Logger;
  readonly batch: number;
}

export interface ResolveStep {
  readonly cursors: CopyMergeResolveCursor[];
  readonly resolved: number;
  readonly blocked: boolean;
}

const knownEmailIds = (remote: readonly RemoteEmailId[]): ResolvedEmailId[] =>
  remote.flatMap(({ uid, emailId }) => (emailId === null ? [] : [{ uid, emailId }]));

export class EmailIdResolver {
  constructor(private readonly deps: EmailIdResolverDeps) {}

  async cursorsOf(
    accountId: AccountId,
    mailboxes: readonly Mailbox[],
  ): Promise<CopyMergeResolveCursor[]> {
    const states = await this.deps.syncStates.listByAccount(accountId);
    const synced = new Set(states.map((state) => state.mailboxId));
    return mailboxes
      .filter((mailbox) => synced.has(mailbox.id))
      .map((mailbox) => ({ mailboxId: mailbox.id, afterUid: 0 }));
  }

  async step(
    context: SyncContext,
    mailboxes: readonly Mailbox[],
    cursors: readonly CopyMergeResolveCursor[],
  ): Promise<ResolveStep> {
    const [cursor, ...rest] = cursors;
    if (cursor === undefined) {
      return { cursors: [], resolved: 0, blocked: false };
    }
    const resolved = await this.resolve(context, mailboxes, cursor);
    if (resolved === null) {
      return this.step(context, mailboxes, rest);
    }
    return { ...resolved, cursors: [...resolved.cursors, ...rest] };
  }

  private async resolve(
    context: SyncContext,
    mailboxes: readonly Mailbox[],
    cursor: CopyMergeResolveCursor,
  ): Promise<ResolveStep | null> {
    const mailbox = mailboxes.find((entry) => entry.id === cursor.mailboxId);
    const state = await this.deps.syncStates.find(cursor.mailboxId);
    if (mailbox === undefined || state === null) {
      return null;
    }
    const { batch, resolutions } = this.deps;
    const unresolved = await resolutions.listUnresolved(mailbox.id, cursor.afterUid, batch);
    const last = unresolved.at(-1);
    if (last === undefined) {
      return null;
    }
    const uids = unresolved.map((placement) => placement.uid);
    const remote = await this.fetch(context, mailbox, state, uids);
    if (remote === null) {
      return { cursors: [{ mailboxId: mailbox.id, afterUid: 0 }], resolved: 0, blocked: true };
    }
    const resolved = await resolutions.fillEmailIds(mailbox.id, knownEmailIds(remote));
    const more = unresolved.length >= batch;
    const cursors = more ? [{ mailboxId: mailbox.id, afterUid: last.uid }] : [];
    return { cursors, resolved, blocked: false };
  }

  private async fetch(
    context: SyncContext,
    mailbox: Mailbox,
    state: MailboxSyncState,
    uids: readonly number[],
  ): Promise<RemoteEmailId[] | null> {
    try {
      return await context.provider.fetchEmailIds(mailbox.path, state.uidValidity, uids);
    } catch (error) {
      if (!(error instanceof UidValidityChangedError)) {
        throw error;
      }
      this.deps.logger.info('Copy merge waits for a mailbox with a new UIDVALIDITY', {
        accountId: context.account.id,
        mailboxId: mailbox.id,
      });
      return null;
    }
  }
}
