import type { MailAccount } from '@relay/shared';
import type { ActionTargets } from './action-targets';
import { describeRule } from './rule-summary';
import type { RuleInput } from './editable-rule';

export interface RuleSummaryCardProps {
  readonly input: RuleInput;
  readonly accounts: readonly MailAccount[];
  readonly targets: ActionTargets;
}

export function RuleSummaryCard({ input, accounts, targets }: RuleSummaryCardProps) {
  const account = accounts.find((item) => item.id === input.accountId);
  return (
    <section className="au-summary" aria-label="Zhrnutie pravidla">
      <p>
        <b>Zhrnutie:</b> {describeRule(input, targets, account?.displayName ?? null)}
      </p>
    </section>
  );
}
