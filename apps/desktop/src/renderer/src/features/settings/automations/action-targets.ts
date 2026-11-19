import type { AutomationAction, Label, MailAccount, Mailbox } from '@relay/shared';
import { moveTargetsOf } from '../../mail/move-targets';
import { ACTION_LABELS } from './automation-labels';

export interface ActionTargets {
  readonly mailboxes: readonly Mailbox[];
  readonly labels: readonly Label[];
  readonly loaded: boolean;
  readonly gmail: boolean;
}

export interface ActionView {
  readonly label: string;
  readonly broken: boolean;
}

export const isGmailAccount = (
  account: MailAccount | undefined,
  mailboxes: readonly Mailbox[],
): boolean =>
  account?.provider === 'gmail' || mailboxes.some((mailbox) => mailbox.role === 'label');

export const moveChoiceLabel = (gmail: boolean): string =>
  gmail ? 'Presunúť do štítka' : 'Presunúť do priečinka';

export const actionKey = (action: AutomationAction): string =>
  action.type === 'addLabel' ? `addLabel:${action.labelId}` : action.type;

const moveTarget = (mailboxId: string, targets: ActionTargets) =>
  moveTargetsOf(targets.mailboxes).find((item) => item.mailbox.id === mailboxId);

export const moveTargetView = (mailboxId: string, targets: ActionTargets): ActionView => {
  const target = moveTarget(mailboxId, targets);
  if (target !== undefined) {
    return { label: target.label, broken: false };
  }
  if (!targets.loaded) {
    return { label: 'Načítavam…', broken: false };
  }
  return { label: 'Priečinok už neexistuje', broken: true };
};

const moveView = (mailboxId: string, targets: ActionTargets): ActionView => {
  const target = moveTarget(mailboxId, targets);
  if (target !== undefined) {
    const prefix = target.kind === 'label' ? 'Presunúť do štítka' : 'Presunúť do';
    return { label: `${prefix} ${target.label}`, broken: false };
  }
  if (!targets.loaded) {
    return { label: moveChoiceLabel(targets.gmail), broken: false };
  }
  return { label: 'Priečinok už neexistuje', broken: true };
};

const labelView = (labelId: string, targets: ActionTargets): ActionView => {
  const label = targets.labels.find((item) => item.id === labelId);
  if (label !== undefined) {
    return { label: `Štítok ${label.name}`, broken: false };
  }
  if (!targets.loaded) {
    return { label: 'Pridať štítok', broken: false };
  }
  return { label: 'Štítok už neexistuje', broken: true };
};

export const describeAction = (action: AutomationAction, targets: ActionTargets): ActionView => {
  if (action.type === 'moveTo') {
    return moveView(action.mailboxId, targets);
  }
  if (action.type === 'addLabel') {
    return labelView(action.labelId, targets);
  }
  return { label: ACTION_LABELS[action.type], broken: false };
};
