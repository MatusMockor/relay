import type { AiRunnerKind, AutomationInput } from '@relay/shared';
import { useRef, useState } from 'react';
import { describeError } from '../../../data/errors';
import { useAutomations } from '../../../data/hooks/use-mail-queries';
import { useReplaceAutomations } from '../../../data/hooks/use-replace-automations';
import { showToast } from '../../../state/toast-store';
import {
  editableOf,
  type EditableRule,
  isComplete,
  newRule,
  type RuleChange,
} from './editable-rule';

export interface AutomationEditor {
  readonly rules: readonly EditableRule[];
  readonly loading: boolean;
  readonly saving: boolean;
  readonly editing: string | null;
  engage(key: string): void;
  change(key: string, change: RuleChange): void;
  remove(key: string): void;
  add(runner: AiRunnerKind): void;
}

const withoutKey = <Value>(map: ReadonlyMap<string, Value>, key: string): Map<string, Value> => {
  const next = new Map(map);
  next.delete(key);
  return next;
};

export const useAutomationEditor = (): AutomationEditor => {
  const automations = useAutomations();
  const replace = useReplaceAutomations();
  const [local, setLocal] = useState<ReadonlyMap<string, EditableRule>>(new Map());
  const [editing, setEditing] = useState<string | null>(null);
  const counter = useRef(0);
  const saved = (automations.data ?? []).map(editableOf);
  const drafts = [...local.values()].filter((rule) => !rule.saved);
  const rules = [...saved.map((rule) => local.get(rule.key) ?? rule), ...drafts];
  const saving = replace.isPending;

  const persist = (inputs: AutomationInput[], settled: string) => {
    replace.mutate(inputs, {
      onSuccess: (stored) => {
        setLocal((current) => withoutKey(current, settled));
        const known = new Set(saved.map((rule) => rule.key));
        const created = stored.find((automation) => !known.has(automation.id));
        if (created !== undefined && editing === settled) {
          setEditing(created.id);
        }
      },
      onError: (error) => {
        showToast(describeError(error));
      },
    });
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
    const inputs = saved.map((item) => (item.key === key ? next.input : item.input));
    persist(next.saved ? inputs : [...inputs, next.input], key);
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
    persist(
      saved.filter((item) => item.key !== key).map((item) => item.input),
      key,
    );
  };

  const add = (runner: AiRunnerKind) => {
    counter.current += 1;
    const key = `draft-${String(counter.current)}`;
    setLocal((current) => new Map(current).set(key, newRule(key, runner, rules.length)));
    setEditing(key);
  };

  return {
    rules,
    loading: automations.data === undefined,
    saving,
    editing,
    engage: setEditing,
    change,
    remove,
    add,
  };
};
