import {
  isPendingPlacement,
  type MailboxRoleOf,
  type Message,
  type MessagePlacement,
  placementIn,
  primaryPlacement,
  rankedPlacements,
} from '@relay/shared/domain';
import type { ProviderChange, ProviderOpWork } from '../../model/pending-work';

type PlacementPicker = (
  op: ProviderOpWork,
  message: Message,
  roleOf: MailboxRoleOf,
) => MessagePlacement;

const moveSource: PlacementPicker = (op, message, roleOf) =>
  (op.source === undefined ? undefined : placementIn(message, op.source.mailboxId)) ??
  primaryPlacement(message, roleOf);

const labelCarrier: PlacementPicker = (_op, message, roleOf) => {
  const ranked = rankedPlacements(message, roleOf);
  const allMail = ranked.find(
    (placement) => !isPendingPlacement(placement) && roleOf(placement.mailboxId) === 'archive',
  );
  return allMail ?? primaryPlacement(message, roleOf);
};

const primary: PlacementPicker = (_op, message, roleOf) => primaryPlacement(message, roleOf);

const PICKERS: Readonly<Record<ProviderChange['kind'], PlacementPicker>> = {
  move: moveSource,
  label: labelCarrier,
  flag: primary,
  keyword: primary,
};

export const opPlacement = (
  op: ProviderOpWork,
  message: Message,
  roleOf: MailboxRoleOf,
): MessagePlacement => PICKERS[op.change.kind](op, message, roleOf);
