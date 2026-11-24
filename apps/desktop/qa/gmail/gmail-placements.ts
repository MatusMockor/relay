import type { GmailServer } from './gmail-server';
import { labelsOf, selectableMailboxes } from './gmail-message';

export interface Placement {
  readonly path: string;
  readonly uid: number;
  readonly labels: readonly string[];
  readonly flags: readonly string[];
}

export const placementsOf = (gmail: GmailServer, messageId: string): Placement[] => {
  const header = `Message-ID: ${messageId}`;
  return selectableMailboxes(gmail.server).flatMap((mailbox) =>
    mailbox.messages
      .filter((message) => message.ghost !== true && message.raw.includes(header))
      .map((message) => ({
        path: mailbox.path,
        uid: message.uid,
        labels: labelsOf(message),
        flags: message.flags.filter((flag) => flag !== '\\Recent'),
      })),
  );
};

export const describePlacements = (placements: readonly Placement[]): string =>
  placements.length === 0
    ? 'nowhere'
    : placements
        .map(
          (placement) =>
            `${placement.path}#${String(placement.uid)}[${placement.labels.join(',')}]`,
        )
        .join(' ');
