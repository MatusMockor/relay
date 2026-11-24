import { SectionBackButton } from '../SectionHeader';
import { RuleName } from '../automations/RuleName';

export interface SplitDetailHeaderProps {
  readonly name: string;
  readonly unsaved: boolean;
  readonly disabled: boolean;
  readonly onBack: () => void;
  readonly onRename: (name: string) => void;
}

export function SplitDetailHeader({
  name,
  unsaved,
  disabled,
  onBack,
  onRename,
}: SplitDetailHeaderProps) {
  return (
    <header className="sh-head au-dh">
      <SectionBackButton label="Split Inbox" ariaLabel="Späť na splity" onBack={onBack} />
      <div className="au-dt">
        <h2>
          <RuleName
            name={name}
            disabled={disabled}
            onRename={onRename}
            noun="split"
            fieldLabel="Názov splitu"
          />
        </h2>
        {unsaved ? <span className="scope warn">Neuložené</span> : null}
      </div>
    </header>
  );
}
