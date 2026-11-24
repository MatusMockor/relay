import {
  isPendingPlacement,
  type Mailbox,
  type Message,
  type MessagePlacement,
  rankedPlacements,
} from '@relay/shared/domain';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import { mailboxRoleOf } from './mailbox-role-of';

export interface LocatedPlacement {
  readonly placement: MessagePlacement;
  readonly mailbox: Mailbox;
}

const NO_ROLE = (): undefined => undefined;

export class PlacementLocations {
  constructor(private readonly mailboxes: MailboxRepository) {}

  async of(message: Message): Promise<LocatedPlacement[]> {
    const known = rankedPlacements(message, NO_ROLE).filter(
      (placement) => !isPendingPlacement(placement),
    );
    const found = await Promise.all(
      known.map((placement) => this.mailboxes.findById(placement.mailboxId)),
    );
    const mailboxes = found.filter((mailbox): mailbox is Mailbox => mailbox !== null);
    const byId = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
    return rankedPlacements(message, mailboxRoleOf(mailboxes)).flatMap((placement) => {
      const mailbox = byId.get(placement.mailboxId);
      if (mailbox === undefined || isPendingPlacement(placement)) {
        return [];
      }
      return [{ placement, mailbox }];
    });
  }
}
