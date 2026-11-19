import type { AiRunnerKind, Automation, AutomationInput } from '@relay/shared';
import { useRef, useState } from 'react';
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
  readonly editing: string | null;
  engage(key: string | null): void;
  change(key: string, change: RuleChange): void;
  remove(key: string): void;
  reorder(from: number, to: number): void;
  addFrom(template: RuleTemplate, runner: AiRunnerKind): void;
}

const withoutKey = <Value>(map: ReadonlyMap<string, Value>, key: string): Map<string, Value> => {
  const next = new Map(map);
  next.delete(key);
  return next;
};

export const useAutomationEditor = (): AutomationEditor => {
  const automations = useAutomations();
  const { saving, persist } = usePersistAutomations();
  const [local, setLocal] = useState<ReadonlyMap<string, EditableRule>>(new Map());
  const [editing, setEditing] = useState<string | null>(null);
  const counter = useRef(0);
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
      setEditing((current) => (current === settled ? created.id : current));
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
    counter.current += 1;
    const key = `draft-${String(counter.current)}`;
    const rule = newRule(key, runner, rules.length, template);
    setLocal((current) => new Map(current).set(key, rule));
    setEditing(key);
    if (isComplete(rule) && !saving) {
      commit(rule);
    }
  };

  return {
    rules,
    loading: automations.data === undefined,
    saving,
    editing,
    engage: setEditing,
    change,
    remove,
    reorder,
    addFrom,
  };
};
