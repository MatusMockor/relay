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
import { holdsMoveTarget } from '../shared/move-target-held';

type PlacementPicker = (
  op: ProviderOpWork,
  message: Message,
  roleOf: MailboxRoleOf,
) => MessagePlacement | null;

const moveSource: PlacementPicker = (op, message, roleOf) => {
  const { change, source } = op;
  if (source === undefined || change.kind !== 'move') {
    return primaryPlacement(message, roleOf);
  }
  const placed = placementIn(message, source.mailboxId);
  if (placed !== undefined) {
    return placed;
  }
  return holdsMoveTarget(message, change, roleOf) ? null : primaryPlacement(message, roleOf);
};

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
): MessagePlacement | null => PICKERS[op.change.kind](op, message, roleOf);
