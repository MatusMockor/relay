import type {
  AccountId,
  AccountStatus,
  ImapSmtpSettings,
  MailAccount,
  UserId,
} from '@relay/shared/domain';

export interface AccountChanges {
  readonly displayName?: string;
  readonly senderName?: string | null;
  readonly color?: string;
  readonly isPrimary?: boolean;
  readonly syncIntervalSeconds?: number;
  readonly settings?: ImapSmtpSettings;
}

export interface AccountStatusChange {
  readonly status: AccountStatus;
  readonly lastError: string | null;
  readonly lastSyncedAt?: string;
}

export interface AccountRepository {
  listByUser(userId: UserId): Promise<MailAccount[]>;
  listByUserForUpdate(userId: UserId): Promise<MailAccount[]>;
  findById(userId: UserId, accountId: AccountId): Promise<MailAccount | null>;
  findByEmail(userId: UserId, email: string): Promise<MailAccount | null>;
  listSyncable(): Promise<MailAccount[]>;
  create(account: MailAccount): Promise<MailAccount>;
  update(
    userId: UserId,
    accountId: AccountId,
    changes: AccountChanges,
  ): Promise<MailAccount | null>;
  setPrimary(userId: UserId, accountId: AccountId): Promise<void>;
  reorder(userId: UserId, orderedIds: readonly AccountId[]): Promise<number>;
  updateStatus(accountId: AccountId, change: AccountStatusChange): Promise<void>;
  delete(userId: UserId, accountId: AccountId): Promise<boolean>;
}
