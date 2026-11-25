import type { AutomationInput } from '@relay/shared';
import { ACTION_LABELS } from './automation-labels';
import type { RuleChange } from './editable-rule';
import { InstructionsBox } from './InstructionsBox';
import { ModelPicker } from './ModelPicker';
import { firstAiAction } from './rule-summary';

export interface AiSectionProps {
  readonly input: AutomationInput;
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
}

export function AiSection({ input, disabled, onChange }: AiSectionProps) {
  const first = firstAiAction(input.actions);
  if (first === null) {
    return null;
  }
  return (
    <section className="au-sec" aria-labelledby="au-ai">
      <h3 id="au-ai">AI</h3>
      <p className="au-lead">„{ACTION_LABELS[first]}“ používa AI. Nastavenie je voliteľné.</p>
      <InstructionsBox
        value={input.ai.instructions}
        disabled={disabled}
        onSave={(instructions) => {
          onChange({ ai: { ...input.ai, instructions } });
        }}
      />
      <div className="au-model">
        <span>Model</span>
        <ModelPicker
          value={input.ai}
          settingsOption
          disabled={disabled}
          onChange={(choice) => {
            onChange({ ai: { ...input.ai, ...choice } });
          }}
        />
      </div>
    </section>
  );
}
