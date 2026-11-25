import {
  type AiModelSelection,
  type AiRunnerInfo,
  type AiRunnerKind,
  type AiSettings,
  DEFAULT_USER_SETTINGS,
} from '@relay/shared';
import { ModelPicker } from '../../automations/ModelPicker';
import { SettingRow } from '../../SettingRow';

type ModelSettingKey = 'defaultModel' | 'backgroundModel';

const MODEL_ROWS: readonly (readonly [ModelSettingKey, string, string])[] = [
  [
    'defaultModel',
    'Predvolený model',
    'Pre chat, návrhy a zhrnutia. V paneli AI sa dá zmeniť pre jednu konverzáciu.',
  ],
  [
    'backgroundModel',
    'Model na pozadí',
    'Jednoriadkové zhrnutia a Jira triáž bežia pri každom novom maile',
  ],
];

const NOT_INSTALLED = 'nenainštalované';

const isMissing = (runners: readonly AiRunnerInfo[] | undefined, runner: AiRunnerKind): boolean =>
  runners !== undefined && runners.find((info) => info.runner === runner)?.installed !== true;

export interface ModelRowsProps {
  readonly ai: AiSettings | undefined;
  readonly runners: readonly AiRunnerInfo[] | undefined;
  readonly onChange: (key: ModelSettingKey, choice: AiModelSelection) => void;
}

export function ModelRows({ ai, runners, onChange }: ModelRowsProps) {
  return (
    <>
      {MODEL_ROWS.map(([key, title, description]) => {
        const value = ai?.[key] ?? DEFAULT_USER_SETTINGS.ai[key];
        return (
          <SettingRow key={key} title={title} description={description}>
            <ModelPicker
              label={title}
              value={value}
              warning={isMissing(runners, value.runner) ? NOT_INSTALLED : null}
              onChange={(choice) => {
                onChange(key, choice);
              }}
            />
          </SettingRow>
        );
      })}
    </>
  );
}
