import type {
  AccountId,
  MailboxId,
  MailboxRole,
  Message,
  MessagePlacement,
} from '@relay/shared/domain';
import type { MessageHeaders } from './split-match-subject';

export interface PlacementIdentity {
  readonly accountId: AccountId;
  readonly location: MessagePlacement;
  readonly role: MailboxRole;
  readonly emailId: string | null;
  readonly labelBased: boolean;
  readonly messageIdHeader: string | null;
}

export interface EffectGates {
  readonly jira: boolean;
  readonly invite: boolean;
}

export type PlacedKind = 'refreshed' | 'attached' | 'adopted';

export interface PlacementMatch {
  readonly kind: PlacedKind;
  readonly message: Message;
  readonly gates: EffectGates;
}

export interface NewMessage {
  readonly message: Message;
  readonly headers: MessageHeaders;
}

export interface PlaceRequest extends PlacementIdentity {
  readonly create: NewMessage | null;
  readonly claims: EffectGates;
  readonly at: string;
}

export type PlaceOutcome =
  | { readonly kind: 'unmatched' }
  | {
      readonly kind: PlacedKind | 'created';
      readonly message: Message;
      readonly previous: readonly MessagePlacement[];
      readonly claimed: EffectGates;
    };

export interface PlacementMove {
  readonly from: MailboxId;
  readonly to: MessagePlacement;
  readonly keepSource: boolean;
}
