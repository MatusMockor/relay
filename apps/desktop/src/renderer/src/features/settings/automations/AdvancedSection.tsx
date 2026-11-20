import type { AutomationConditionType } from '@relay/shared';
import { Button, Icon, Segmented } from '@relay/ui';
import { useState } from 'react';

export type AdvancedTarget = 'conditions' | 'exceptions';

const ADVANCED_CHOICES: readonly { type: AutomationConditionType; label: string }[] = [
  { type: 'subjectRegex', label: '+ Predmet podľa regulárneho výrazu' },
  { type: 'header', label: '+ Hlavička mailu' },
];

const TARGETS: readonly { value: AdvancedTarget; label: string }[] = [
  { value: 'conditions', label: 'Keď' },
  { value: 'exceptions', label: 'Okrem' },
];

export interface AdvancedSectionProps {
  readonly disabled: boolean;
  readonly onAdd: (target: AdvancedTarget, type: AutomationConditionType) => void;
}

export function AdvancedSection({ disabled, onAdd }: AdvancedSectionProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<AdvancedTarget>('conditions');
  return (
    <section className="au-sec au-adv" aria-labelledby="au-adv">
      <h3 id="au-adv">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="au-adv-body"
          onClick={() => {
            setOpen(!open);
          }}
        >
          Pokročilé
          <Icon name={open ? 'up' : 'down'} size={13} />
        </button>
      </h3>
      {open ? (
        <div id="au-adv-body">
          <p className="au-lead">
            Podmienky s regulárnym výrazom v predmete alebo s hodnotou hlavičky mailu.
          </p>
          <div className="au-match">
            <span>Pridať do sekcie</span>
            <Segmented<AdvancedTarget>
              label="Kam pridať pokročilú podmienku"
              options={TARGETS}
              value={target}
              disabled={disabled}
              onChange={setTarget}
            />
          </div>
          <div className="au-adv-acts">
            {ADVANCED_CHOICES.map((choice) => (
              <Button
                key={choice.type}
                variant="ghost"
                className="au-add"
                disabled={disabled}
                onClick={() => {
                  onAdd(target, choice.type);
                }}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
