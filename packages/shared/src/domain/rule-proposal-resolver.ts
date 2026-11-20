import type { AutomationCondition } from './automation-condition';
import type { ProposedAction, RuleProposal } from './rule-proposal';
import { resolveProposedActions } from './rule-proposal-actions';
import {
  RULE_SUGGEST_MAX_NOTES,
  RULE_SUGGESTION_NOTE_MAX_LENGTH,
  type RuleSuggestAccount,
  type RuleSuggestion,
  type RuleSuggestRequest,
} from './rule-suggestion';
import { ruleIntent } from './rule-intent';
import { findTarget } from './rule-target-match';

interface CheckedConditions {
  readonly kept: AutomationCondition[];
  readonly notes: string[];
}

const RULE_NAME_MAX_LENGTH = 100;

const compiles = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

const patternOf = (condition: AutomationCondition): string | null =>
  condition.type === 'subjectRegex' || condition.type === 'header' ? condition.pattern : null;

const checkConditions = (conditions: readonly AutomationCondition[]): CheckedConditions => {
  const kept: AutomationCondition[] = [];
  const notes: string[] = [];
  conditions.forEach((condition) => {
    const pattern = patternOf(condition);
    if (pattern !== null && !compiles(pattern)) {
      notes.push(`regulárny výraz „${pattern.slice(0, 60)}“ (neplatný)`);
      return;
    }
    kept.push(condition);
  });
  return { kept, notes };
};

const strongestName = (conditions: readonly AutomationCondition[]): string | null => {
  const sender = conditions.find((condition) => condition.type === 'fromAddress');
  if (sender?.type === 'fromAddress') {
    return sender.address;
  }
  const domain = conditions.find((condition) => condition.type === 'fromDomain');
  if (domain?.type === 'fromDomain') {
    return domain.domain;
  }
  const subject = conditions.find((condition) => condition.type === 'subjectContains');
  return subject?.type === 'subjectContains' ? subject.value : null;
};

const needsAccount = (action: ProposedAction): boolean =>
  action.type === 'addLabel' || action.type === 'moveTo' || action.type === 'forward';

const holdsTargets = (account: RuleSuggestAccount, actions: readonly ProposedAction[]) =>
  actions.every((action) => {
    if (action.type === 'addLabel') {
      return findTarget(account.labels, action.label).kind === 'found';
    }
    if (action.type === 'moveTo') {
      return findTarget(account.folders, action.folder).kind === 'found';
    }
    return true;
  });

const inferAccount = (
  accounts: readonly RuleSuggestAccount[],
  actions: readonly ProposedAction[],
): RuleSuggestAccount | null => {
  const scoped = actions.filter(needsAccount);
  if (scoped.length === 0) {
    return null;
  }
  if (accounts.length === 1) {
    return accounts[0] ?? null;
  }
  const holding = accounts.filter((account) => holdsTargets(account, scoped));
  return holding.length === 1 ? (holding[0] ?? null) : null;
};

const accountFor = (
  proposal: RuleProposal,
  request: RuleSuggestRequest,
): RuleSuggestAccount | null => {
  const byId = (id: string | null) =>
    id === null ? undefined : request.accounts.find((account) => account.id === id);
  return (
    byId(proposal.accountId) ??
    byId(request.accountId) ??
    inferAccount(request.accounts, proposal.actions)
  );
};

export const resolveRuleProposal = (
  proposal: RuleProposal,
  request: RuleSuggestRequest,
): RuleSuggestion => {
  const account = accountFor(proposal, request);
  const actions = resolveProposedActions(proposal.actions, {
    account,
    sentence: request.sentence,
    intent: ruleIntent(request.sentence),
  });
  const conditions = checkConditions(proposal.conditions);
  const exceptions = checkConditions(proposal.exceptions);
  return {
    name: (strongestName(conditions.kept) ?? proposal.name).slice(0, RULE_NAME_MAX_LENGTH),
    accountId: account?.id ?? null,
    match: proposal.match,
    conditions: conditions.kept,
    exceptions: exceptions.kept,
    actions: actions.actions,
    understood: proposal.understood,
    unmapped: [...proposal.unmapped, ...conditions.notes, ...exceptions.notes, ...actions.notes]
      .slice(0, RULE_SUGGEST_MAX_NOTES)
      .map((note) => note.slice(0, RULE_SUGGESTION_NOTE_MAX_LENGTH)),
  };
};
