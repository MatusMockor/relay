import type { Automation } from '@relay/shared';
import { useRef } from 'react';
import { describeError } from '../../data/errors';
import { useApplyAutomation } from '../../data/hooks/use-apply-automation';
import { toAutomationInput, useReplaceAutomations } from '../../data/hooks/use-replace-automations';
import { showToast } from '../../state/toast-store';
import { applyResultMessage } from '../settings/automations/apply-result';
import type { RuleInput } from '../settings/automations/editable-rule';

export interface CreateMailRule {
  readonly busy: boolean;
  create(input: RuleInput, applyExisting: boolean, onCreated: () => void): void;
}

export const useCreateMailRule = (existing: readonly Automation[]): CreateMailRule => {
  const replace = useReplaceAutomations();
  const apply = useApplyAutomation();
  const submitting = useRef(false);
  const applyTo = (automation: Automation) => {
    void apply.mutateAsync(automation.id).then(
      (result) => {
        showToast(applyResultMessage(result));
      },
      (error: unknown) => {
        showToast(describeError(error));
      },
    );
  };
  const saved =
    (input: RuleInput, applyExisting: boolean, known: ReadonlySet<string>) =>
    (stored: readonly Automation[]) => {
      const created = stored.find((automation) => !known.has(automation.id));
      if (!applyExisting || created === undefined) {
        showToast(`Pravidlo ${input.name} je vytvorené`);
        return;
      }
      applyTo(created);
    };
  return {
    busy: replace.isPending || apply.isPending,
    create: (input, applyExisting, onCreated) => {
      if (submitting.current) {
        return;
      }
      submitting.current = true;
      const known = new Set<string>(existing.map((automation) => automation.id));
      void replace
        .mutateAsync([...existing.map(toAutomationInput), input])
        .then(
          (stored) => {
            onCreated();
            saved(input, applyExisting, known)(stored);
          },
          (error: unknown) => {
            showToast(describeError(error));
          },
        )
        .finally(() => {
          submitting.current = false;
        });
    },
  };
};
