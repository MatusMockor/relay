import type { CreateLabelBody, UpdateLabelBody } from '@relay/shared/api';
import type { AccountId, Label, LabelId, MailAccount, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';
import type { Logger } from '../../ports/logger';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { ProviderOpReplayer } from '../actions/provider-op-replayer';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage, type MailProviderSessions } from '../shared/mail-provider-sessions';
import { publishThreadOutcomes } from '../shared/thread-refresh';
import type { GmailLabelAdmin } from './gmail-label-admin';
import type { LabelAnnouncer } from './label-announcer';
import { labelKindOf } from './label-kind';
import { acceptedLabelName } from './label-name-policy';
import type { LabelRemoval } from './label-removal';

export interface LabelServiceDeps {
  readonly accounts: AccountRepository;
  readonly labels: LabelRepository;
  readonly mailboxes: MailboxRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly removal: LabelRemoval;
  readonly gmail: GmailLabelAdmin;
  readonly sessions: MailProviderSessions;
  readonly replayer: ProviderOpReplayer;
  readonly announcer: LabelAnnouncer;
  readonly events: EngineEvents;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export class LabelService {
  constructor(private readonly deps: LabelServiceDeps) {}

  async create(userId: UserId, body: CreateLabelBody): Promise<Label> {
    const account = await this.requireAccount(userId, body.accountId);
    const kind = await labelKindOf(this.deps.mailboxes, account);
    const others = await this.deps.labels.list(userId, account.id);
    const name = acceptedLabelName({ name: body.name, kind, others, becomesRemoteName: true });
    const color = body.color ?? null;
    const label =
      kind === 'gmail'
        ? await this.deps.gmail.create(account, name, color)
        : await this.createKeyword(account.id, name, color);
    await this.deps.announcer.announce(userId, account.id, kind === 'gmail');
    return label;
  }

  async update(userId: UserId, labelId: LabelId, patch: UpdateLabelBody): Promise<Label> {
    const label = await this.requireLabel(userId, labelId);
    const account = await this.requireAccount(userId, label.accountId);
    const renamed = await this.renamed(userId, account, label, patch.name);
    const saved = await this.deps.labels.upsert(
      patch.color === undefined ? renamed : { ...renamed, color: patch.color },
    );
    await this.deps.announcer.announce(userId, account.id, renamed.remoteName !== label.remoteName);
    return saved;
  }

  async remove(userId: UserId, labelId: LabelId): Promise<void> {
    const label = await this.requireLabel(userId, labelId);
    const account = await this.requireAccount(userId, label.accountId);
    if (label.kind === 'gmail') {
      await this.deps.gmail.remove(account, label);
    }
    const outcomes = await this.deps.removal.run(userId, label);
    await publishThreadOutcomes(this.deps.events, userId, outcomes);
    await this.deps.announcer.announce(userId, account.id, label.kind === 'gmail');
    if (label.kind === 'keyword') {
      await this.purge(account);
    }
  }

  private async renamed(
    userId: UserId,
    account: MailAccount,
    label: Label,
    name: string | undefined,
  ): Promise<Label> {
    if (name === undefined || name.trim() === label.name) {
      return label;
    }
    const others = (await this.deps.labels.list(userId, account.id)).filter(
      (other) => other.id !== label.id,
    );
    const accepted = acceptedLabelName({
      name,
      kind: label.kind,
      others,
      becomesRemoteName: label.kind === 'gmail',
    });
    if (label.kind === 'keyword') {
      return { ...label, name: accepted };
    }
    return this.deps.gmail.rename(account, label, accepted);
  }

  private async createKeyword(
    accountId: AccountId,
    name: string,
    color: string | null,
  ): Promise<Label> {
    const purge = await this.deps.pendingWork.find({ accountId, kind: 'keyword-purge', ref: name });
    if (purge !== null) {
      await this.deps.pendingWork.remove([purge]);
    }
    return this.deps.labels.upsert({
      id: this.deps.ids.generate('label'),
      accountId,
      name,
      color,
      kind: 'keyword',
      remoteName: name,
    });
  }

  private async purge(account: MailAccount): Promise<void> {
    try {
      await this.deps.sessions.with(account, (provider) =>
        this.deps.replayer.purgeKeywords(account, provider),
      );
    } catch (error) {
      this.deps.logger.warn('Removing a deleted label from the mail server failed', {
        accountId: account.id,
        error: errorMessage(error),
      });
    }
  }

  private async requireLabel(userId: UserId, labelId: LabelId): Promise<Label> {
    const label = await this.deps.labels.findById(userId, labelId);
    if (label === null) {
      throw new NotFoundError('Label', labelId);
    }
    return label;
  }

  private async requireAccount(userId: UserId, accountId: AccountId): Promise<MailAccount> {
    const account = await this.deps.accounts.findById(userId, accountId);
    if (account === null) {
      throw new NotFoundError('Account', accountId);
    }
    return account;
  }
}
