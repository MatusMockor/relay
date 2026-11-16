import type { DraftId, ScheduledSend, UserId } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { DraftRepository } from '../../ports/draft-repository';
import type { ScheduledSendRepository } from '../../ports/scheduled-send-repository';
import type { LeaseHeartbeat } from '../shared/lease-heartbeat';
import type { HeldLease, LeaseRenewal } from '../shared/renewed-lease';
import { DRAFT_SEND_LEASE_MS } from './draft-send-claims';

export const SEND_LEASE_RENEWAL_MS = DRAFT_SEND_LEASE_MS / 4;

export interface SendLeasesDeps {
  readonly drafts: DraftRepository;
  readonly scheduledSends: ScheduledSendRepository;
  readonly heartbeat: LeaseHeartbeat;
  readonly clock: Clock;
}

export class SendLeases {
  constructor(private readonly deps: SendLeasesDeps) {}

  holdDraft<Result>(
    userId: UserId,
    draftId: DraftId,
    claimedAt: string,
    work: (lease: HeldLease) => Promise<Result>,
  ): Promise<Result> {
    const renewal = this.renewal(() => this.renewDraft(userId, draftId, claimedAt));
    return this.deps.heartbeat.hold(renewal, { draftId }, work);
  }

  holdScheduled<Result>(
    item: ScheduledSend,
    claimedAt: string,
    work: (lease: HeldLease) => Promise<Result>,
  ): Promise<Result> {
    const renewal = this.renewal(async () => {
      const renewedAt = this.now();
      const held = await this.deps.scheduledSends.renew(item.id, claimedAt, renewedAt);
      return held && (await this.renewDraft(item.userId, item.draftId, claimedAt));
    });
    return this.deps.heartbeat.hold(renewal, { scheduledSendId: item.id }, work);
  }

  private renewDraft(userId: UserId, draftId: DraftId, claimedAt: string): Promise<boolean> {
    return this.deps.drafts.renewSendClaim(userId, draftId, { claimedAt, renewedAt: this.now() });
  }

  private renewal(renew: () => Promise<boolean>): LeaseRenewal {
    return { intervalMs: SEND_LEASE_RENEWAL_MS, renew };
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}
