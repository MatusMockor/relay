import type { Split } from '@relay/shared';
import { Icon, IconButton, Switch } from '@relay/ui';
import { describeRule, readableRule } from './split-rules';

export type SplitFlags = Partial<Pick<Split, 'exclusive' | 'hideTasks'>>;

export interface SplitRowProps {
  readonly split: Split;
  readonly scope: string;
  readonly color: string;
  readonly locked: boolean;
  readonly onRemove: () => void;
  readonly onChange: (flags: SplitFlags) => void;
}

export function SplitRow({ split, scope, color, locked, onRemove, onChange }: SplitRowProps) {
  return (
    <div className="rule">
      <b>
        <span className="dot-slot">
          <span className="acc-dot" style={{ ['--a' as string]: color }} />
        </span>
        {split.name}
      </b>
      <p>
        {scope}
        {split.exclusive ? ' · vyberie maily z Dôležitých' : ''}
      </p>
      <span className="rule-chips" title={split.rules.map(describeRule).join(' OR ')}>
        {split.rules.map((rule, index) => (
          <span className="rule-run" key={`${rule.type}-${String(index)}`}>
            {index > 0 ? <span className="kw">alebo</span> : null}
            <span className="rule-chip">{readableRule(rule)}</span>
          </span>
        ))}
      </span>
      <label className="rule-opt">
        <Switch
          checked={split.hideTasks}
          label={`Skryť vlákna, ktoré sú v Úlohách, v splite ${split.name}`}
          disabled={locked}
          onChange={(hideTasks) => {
            onChange({ hideTasks });
          }}
        />
        <span aria-hidden="true">Skryť vlákna, ktoré sú v Úlohách</span>
      </label>
      <span className="cnt">
        <IconButton label={`Odstrániť split ${split.name}`} disabled={locked} onClick={onRemove}>
          <Icon name="trash" />
        </IconButton>
        <Switch
          checked={split.exclusive}
          label={`Výlučný split ${split.name}`}
          disabled={locked}
          onChange={(exclusive) => {
            onChange({ exclusive });
          }}
        />
      </span>
    </div>
  );
}
