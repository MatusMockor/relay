import type {
  AutomationAction,
  AutomationActivityAction,
  SimpleAutomationActionType,
} from '@relay/shared';
import { moveTargetsOf } from '../../../mail/move-targets';
import type { ActionTargets } from '../action-targets';

export interface HistoryChip {
  readonly key: string;
  readonly label: string;
  readonly failed: boolean;
}

const DONE_LABELS: Readonly<Record<SimpleAutomationActionType, string>> = {
  summary: 'AI zhrnutie',
  task: 'úloha',
  notify: 'notifikácia',
  markRead: 'označené ako prečítané',
  pin: 'pripnuté',
  archive: 'archivované',
};

const labelChip = (labelId: string, targets: ActionTargets): string => {
  const label = targets.labels.find((item) => item.id === labelId);
  if (label !== undefined) {
    return `štítok ${label.name}`;
  }
  return targets.loaded ? 'štítok už neexistuje' : 'štítok';
};

const moveChip = (mailboxId: string, targets: ActionTargets): string => {
  const target = moveTargetsOf(targets.mailboxes).find((item) => item.mailbox.id === mailboxId);
  if (target !== undefined) {
    return `presunuté do ${target.label}`;
  }
  return targets.loaded ? 'priečinok už neexistuje' : 'presunuté';
};

export const historyActionLabel = (action: AutomationAction, targets: ActionTargets): string => {
  if (action.type === 'addLabel') {
    return labelChip(action.labelId, targets);
  }
  if (action.type === 'moveTo') {
    return moveChip(action.mailboxId, targets);
  }
  return DONE_LABELS[action.type];
};

export const historyChipsOf = (
  actions: readonly AutomationActivityAction[],
  targets: ActionTargets,
): HistoryChip[] =>
  actions.map(({ action, outcome }, index) => ({
    key: `${action.type}-${String(index)}`,
    label: historyActionLabel(action, targets),
    failed: outcome === 'failed',
  }));
