import { Switch } from '@relay/ui';
import type { SplitChange, SplitDraft } from './split-draft';

export interface SplitOptionsProps {
  readonly draft: SplitDraft;
  readonly disabled: boolean;
  readonly onChange: (change: SplitChange) => void;
}

export function SplitOptions({ draft, disabled, onChange }: SplitOptionsProps) {
  return (
    <section className="au-sec" aria-labelledby="sp-opts">
      <h3 id="sp-opts">Možnosti</h3>
      <label className="sp-opt">
        <Switch
          checked={draft.exclusive}
          label={`Vybrať maily z Dôležitých do splitu ${draft.name}`}
          disabled={disabled}
          onChange={(exclusive) => {
            onChange({ exclusive });
          }}
        />
        <span aria-hidden="true">Vybrať maily z Dôležitých</span>
      </label>
      <label className="sp-opt">
        <Switch
          checked={draft.hideTasks}
          label={`Skryť vlákna, ktoré sú v Úlohách, v splite ${draft.name}`}
          disabled={disabled}
          onChange={(hideTasks) => {
            onChange({ hideTasks });
          }}
        />
        <span aria-hidden="true">Skryť vlákna, ktoré sú v Úlohách</span>
      </label>
    </section>
  );
}
