import {
  type AutomationAction,
  type AutomationActionType,
  PLACEMENT_ACTION_TYPES,
} from './automation-action';
import { EmailAddressSchema } from './primitives';
import type { ProposedAction } from './rule-proposal';
import type { RuleIntent } from './rule-intent';
import type { RuleSuggestAccount } from './rule-suggestion';
import { findTarget, mentionsName, type NamedTarget } from './rule-target-match';

export interface ResolvedActions {
  readonly actions: AutomationAction[];
  readonly notes: string[];
}

interface ActionContext {
  readonly account: RuleSuggestAccount | null;
  readonly sentence: string;
  readonly intent: RuleIntent;
}

type Step = { readonly action: AutomationAction } | { readonly note: string };

const NOUNS: Readonly<Record<AutomationActionType, string>> = {
  summary: 'AI zhrnutie',
  task: 'úloha',
  draftReply: 'návrh odpovede',
  notify: 'upozornenie',
  markRead: 'označenie ako prečítané',
  pin: 'pripnutie',
  archive: 'archivovanie',
  moveTo: 'presun',
  addLabel: 'štítok',
  remind: 'pripomenutie',
  forward: 'preposlanie',
};

const NOT_ASKED = '(veta to nežiada)';

const keyOf = (action: AutomationAction): string =>
  action.type === 'addLabel' ? `addLabel:${action.labelId}` : action.type;

const nounOf = (proposed: ProposedAction): string => {
  if (proposed.type === 'addLabel') {
    return `štítok „${proposed.label}“`;
  }
  if (proposed.type === 'moveTo') {
    return `priečinok „${proposed.folder}“`;
  }
  return NOUNS[proposed.type];
};

const targetStep = <Target extends NamedTarget>(
  noun: string,
  name: string,
  targets: readonly Target[] | null,
  build: (target: Target) => AutomationAction,
): Step => {
  if (targets === null) {
    return { note: `${noun} (vyber účet)` };
  }
  const match = findTarget(targets, name);
  if (match.kind === 'ambiguous') {
    return { note: `${noun} (nejednoznačný názov)` };
  }
  if (match.kind === 'none') {
    return { note: `${noun} (neexistuje)` };
  }
  return { action: build(match.target) };
};

const stepOf = (proposed: ProposedAction, context: ActionContext): Step => {
  const noun = nounOf(proposed);
  if (!context.intent.actions.has(proposed.type)) {
    return { note: `${noun} ${NOT_ASKED}` };
  }
  const { account } = context;
  if (proposed.type === 'addLabel' || proposed.type === 'moveTo') {
    const name = proposed.type === 'addLabel' ? proposed.label : proposed.folder;
    if (!mentionsName(context.sentence, name)) {
      return { note: `${noun} (veta ho nemenuje)` };
    }
    return proposed.type === 'addLabel'
      ? targetStep(noun, name, account?.labels ?? null, (label) => ({
          type: 'addLabel',
          labelId: label.id,
        }))
      : targetStep(noun, name, account?.folders ?? null, (folder) => ({
          type: 'moveTo',
          mailboxId: folder.id,
        }));
  }
  if (proposed.type === 'forward') {
    const listed = context.intent.forwardTo.has(proposed.to.toLowerCase());
    if (!listed || !EmailAddressSchema.safeParse(proposed.to).success) {
      return { note: `preposlanie na „${proposed.to}“ (adresa nie je vo vete ako cieľ)` };
    }
    return account === null
      ? { note: 'preposlanie (vyber účet)' }
      : { action: { type: 'forward', to: proposed.to } };
  }
  if (proposed.type === 'remind') {
    return { action: { type: 'remind', afterDays: proposed.afterDays } };
  }
  return { action: { type: proposed.type } };
};

export const resolveProposedActions = (
  proposed: readonly ProposedAction[],
  context: ActionContext,
): ResolvedActions => {
  const actions: AutomationAction[] = [];
  const notes: string[] = [];
  for (const step of proposed.map((item) => stepOf(item, context))) {
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
        `${NOUNS[step.action.type]} (pravidlo mail iba presunie, archivuje alebo pripomenie)`,
      );
      continue;
    }
    actions.push(step.action);
  }
  return { actions, notes };
};
