import { Icon, Sheet } from '@relay/ui';
import type { ReactNode } from 'react';

export const RULE_FROM_MAIL_TITLE = 'Nové pravidlo z mailu';

export interface RuleFromMailSheetProps {
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function RuleFromMailSheet({ onClose, children }: RuleFromMailSheetProps) {
  return (
    <Sheet label={RULE_FROM_MAIL_TITLE} className="rfm" onClose={onClose}>
      <header className="rfm-head">
        <span className="rfm-ic" aria-hidden="true">
          <Icon name="bolt" size={14} />
        </span>
        <h3>{RULE_FROM_MAIL_TITLE}</h3>
      </header>
      {children}
    </Sheet>
  );
}
