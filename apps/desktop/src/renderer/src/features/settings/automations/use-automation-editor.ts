import type { AiRunnerKind, Automation, AutomationInput } from '@relay/shared';
import { useState } from 'react';
import { useAutomations } from '../../../data/hooks/use-mail-queries';
import {
  editableOf,
  type EditableRule,
  isComplete,
  newRule,
  type RuleChange,
} from './editable-rule';
import { canMove, moveRule } from './rule-order';
import type { RuleTemplate } from './rule-templates';
import { usePersistAutomations } from './use-persist-automations';

export interface AutomationEditor {
  readonly rules: readonly EditableRule[];
  readonly loading: boolean;
  readonly saving: boolean;
  change(key: string, change: RuleChange): void;
  remove(key: string): void;
  reorder(from: number, to: number): void;
  addFrom(template: RuleTemplate, runner: AiRunnerKind): string;
}

let draftCount = 0;

const nextDraftKey = (): string => {
  draftCount += 1;
  return `draft-${String(draftCount)}`;
};

const withoutKey = <Value>(map: ReadonlyMap<string, Value>, key: string): Map<string, Value> => {
  const next = new Map(map);
  next.delete(key);
  return next;
};

export const useAutomationEditor = (
  onCreated: (draftKey: string, id: string) => void,
): AutomationEditor => {
  const automations = useAutomations();
  const { saving, persist } = usePersistAutomations();
  const [local, setLocal] = useState<ReadonlyMap<string, EditableRule>>(new Map());
  const saved = (automations.data ?? []).map(editableOf);
  const drafts = [...local.values()].filter((rule) => !rule.saved);
  const rules = [...saved.map((rule) => local.get(rule.key) ?? rule), ...drafts];
  const savedInputs = saved.map((rule) => rule.input);

  const save = (inputs: AutomationInput[], settled: string) => {
    const known = new Set(saved.map((rule) => rule.key));
    persist(inputs, (stored: readonly Automation[]) => {
      setLocal((current) => withoutKey(current, settled));
      const created = stored.find((automation) => !known.has(automation.id));
      if (created === undefined) {
        return;
      }
      onCreated(settled, created.id);
    });
  };

  const commit = (next: EditableRule) => {
    const inputs = saved.map((item) => (item.key === next.key ? next.input : item.input));
    save(next.saved ? inputs : [...inputs, next.input], next.key);
  };

  const change = (key: string, update: RuleChange) => {
    const rule = rules.find((item) => item.key === key);
    if (rule === undefined || saving) {
      return;
    }
    const next: EditableRule = { ...rule, input: { ...rule.input, ...update } };
    if (!isComplete(next)) {
      setLocal((current) => new Map(current).set(key, next));
      return;
    }
    commit(next);
  };

  const remove = (key: string) => {
    const rule = rules.find((item) => item.key === key);
    if (rule === undefined || saving) {
      return;
    }
    if (!rule.saved) {
      setLocal((current) => withoutKey(current, key));
      return;
    }
    save(
      saved.filter((item) => item.key !== key).map((item) => item.input),
      key,
    );
  };

  const reorder = (from: number, to: number) => {
    if (saving || !canMove(saved.length, from, to)) {
      return;
    }
    persist(moveRule(savedInputs, from, to), () => undefined);
  };

  const addFrom = (template: RuleTemplate, runner: AiRunnerKind) => {
    const key = nextDraftKey();
    const rule = newRule(key, runner, rules.length, template);
    setLocal((current) => new Map(current).set(key, rule));
    if (isComplete(rule) && !saving) {
      commit(rule);
    }
    return key;
  };

  return {
    rules,
    loading: automations.data === undefined,
    saving,
    change,
    remove,
    reorder,
    addFrom,
  };
};
