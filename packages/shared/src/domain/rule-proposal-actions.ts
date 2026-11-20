import {
  type AutomationAction,
  type AutomationActionType,
  PLACEMENT_ACTION_TYPES,
} from './automation-action';
import type { ProposedAction } from './rule-proposal';
import { asksForReplyDraft, asksToForward, quotesAddress } from './rule-sentence';
import type { RuleSuggestAccount } from './rule-suggestion';
import { findTarget } from './rule-target-match';

export interface ResolvedActions {
  readonly actions: AutomationAction[];
  readonly notes: string[];
}

type Step = { readonly action: AutomationAction } | { readonly note: string };

const PLACEMENT_NAMES: Readonly<Partial<Record<AutomationActionType, string>>> = {
  archive: 'archivovanie',
  moveTo: 'presun',
  remind: 'pripomenutie',
};

const keyOf = (action: AutomationAction): string =>
  action.type === 'addLabel' ? `addLabel:${action.labelId}` : action.type;

const forwardStep = (to: string, account: RuleSuggestAccount | null, sentence: string): Step => {
  if (!asksToForward(sentence)) {
    return { note: 'preposlanie (veta ho nežiada)' };
  }
  if (!quotesAddress(sentence, to)) {
    return { note: `preposlanie na „${to}“ (adresa nie je vo vete)` };
  }
  if (account === null) {
    return { note: 'preposlanie (vyber účet)' };
  }
  return { action: { type: 'forward', to } };
};

const labelStep = (name: string, account: RuleSuggestAccount | null): Step => {
  if (account === null) {
    return { note: `štítok „${name}“ (vyber účet)` };
  }
  const label = findTarget(account.labels, name);
  return label === null
    ? { note: `štítok „${name}“ (neexistuje)` }
    : { action: { type: 'addLabel', labelId: label.id } };
};

const folderStep = (name: string, account: RuleSuggestAccount | null): Step => {
  if (account === null) {
    return { note: `priečinok „${name}“ (vyber účet)` };
  }
  const folder = findTarget(account.folders, name);
  return folder === null
    ? { note: `priečinok „${name}“ (neexistuje)` }
    : { action: { type: 'moveTo', mailboxId: folder.id } };
};

const stepOf = (
  proposed: ProposedAction,
  account: RuleSuggestAccount | null,
  sentence: string,
): Step => {
  if (proposed.type === 'addLabel') {
    return labelStep(proposed.label, account);
  }
  if (proposed.type === 'moveTo') {
    return folderStep(proposed.folder, account);
  }
  if (proposed.type === 'forward') {
    return forwardStep(proposed.to, account, sentence);
  }
  if (proposed.type === 'remind') {
    return { action: { type: 'remind', afterDays: proposed.afterDays } };
  }
  if (proposed.type === 'draftReply' && !asksForReplyDraft(sentence)) {
    return { note: 'návrh odpovede (veta ho nežiada)' };
  }
  return { action: { type: proposed.type } };
};

export const resolveProposedActions = (
  proposed: readonly ProposedAction[],
  account: RuleSuggestAccount | null,
  sentence: string,
): ResolvedActions => {
  const actions: AutomationAction[] = [];
  const notes: string[] = [];
  for (const step of proposed.map((item) => stepOf(item, account, sentence))) {
    if ('note' in step) {
      notes.push(step.note);
      continue;
    }
    if (actions.some((action) => keyOf(action) === keyOf(step.action))) {
      continue;
    }
    const placed = PLACEMENT_ACTION_TYPES.includes(step.action.type);
    if (placed && actions.some((action) => PLACEMENT_ACTION_TYPES.includes(action.type))) {
      notes.push(
        `${PLACEMENT_NAMES[step.action.type] ?? step.action.type} (pravidlo mail iba presunie, archivuje alebo pripomenie)`,
      );
      continue;
    }
    actions.push(step.action);
  }
  return { actions, notes };
};
