import { Icon } from '@relay/ui';
import type { ReactNode } from 'react';

export interface OnboardingFrameProps {
  readonly title: string;
  readonly lead: string;
  readonly step?: number;
  readonly onBack?: () => void;
  readonly children: ReactNode;
}

export function OnboardingFrame({ title, lead, step, onBack, children }: OnboardingFrameProps) {
  return (
    <div className="onb">
      <section className="surface onb-card" aria-labelledby="onb-title">
        <div className="onb-brand">
          <i />
          Relay
        </div>
        {step === undefined ? null : (
          <div className="onb-steps" aria-label={`Krok ${String(step)} z 3`}>
            {[1, 2, 3].map((index) => (
              <i key={index} className={index <= step ? 'on' : undefined} />
            ))}
          </div>
        )}
        <h1 id="onb-title">{title}</h1>
        <p className="lead">{lead}</p>
        {children}
        {onBack === undefined ? null : (
          <button type="button" className="onb-back" onClick={onBack}>
            <Icon name="back" />
            Späť
          </button>
        )}
      </section>
      <div className="horizon" />
    </div>
  );
}
