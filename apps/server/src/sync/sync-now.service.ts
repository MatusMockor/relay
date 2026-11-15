import { Injectable } from '@nestjs/common';
import { AccountService } from '@relay/engine';
import type { SyncNowBody } from '@relay/shared/api';
import type { UserId } from '@relay/shared/domain';
import { SyncTrigger } from '../jobs/sync/sync-trigger';

@Injectable()
export class SyncNowService {
  constructor(
    private readonly accounts: AccountService,
    private readonly trigger: SyncTrigger,
  ) {}

  async request(userId: UserId, body: SyncNowBody): Promise<void> {
    if (body.accountId !== undefined) {
      const account = await this.accounts.require(userId, body.accountId);
      await this.trigger.request(userId, account.id);
      return;
    }
    const accounts = await this.accounts.list(userId);
    for (const account of accounts) {
      await this.trigger.request(userId, account.id);
    }
  }
}
