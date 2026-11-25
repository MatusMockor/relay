import type { AiRunnerInfo, AiRunnerLocation } from '@relay/shared';
import { Status } from '@relay/ui';
import { RUNNERS } from '../../../ai/model-choice/model-choice';
import { RUNNER_LABELS } from '../../../ai/model-choice/model-labels';
import { SettingRow } from '../../SettingRow';
import { SettingsGroup } from '../../SettingsGroup';

const runnerStatus = (info: AiRunnerInfo | undefined) => {
  if (info === undefined || !info.installed) {
    return <Status tone="off" label="Nenainštalované" />;
  }
  if (info.authenticated === false) {
    return <Status tone="warn" label="Čaká na prihlásenie" />;
  }
  return (
    <Status
      tone="ok"
      label={info.version === null ? 'Pripravené' : `Pripravené · ${info.version}`}
    />
  );
};

const SIGN_IN_PLACE: Readonly<Record<AiRunnerLocation, string>> = {
  server: 'v termináli na serveri Relay',
  local: 'v termináli na tomto počítači',
};

export interface RunnerRowsProps {
  readonly title: string;
  readonly where: AiRunnerLocation;
  readonly runners: readonly AiRunnerInfo[];
}

export function RunnerRows({ title, where, runners }: RunnerRowsProps) {
  return (
    <>
      <SettingsGroup title={title} />
      {RUNNERS.map((kind) => {
        const info = runners.find((runner) => runner.runner === kind);
        return (
          <SettingRow
            key={kind}
            title={RUNNER_LABELS[kind]}
            description={
              info?.installed === true && info.authenticated === false ? (
                <>
                  Prihlás sa {SIGN_IN_PLACE[where]} príkazom <code>{kind}</code>, potom Nastavenia
                  zavri a znova otvor
                </>
              ) : (
                <code>{info?.executablePath ?? `${kind} CLI`}</code>
              )
            }
          >
            {runnerStatus(info)}
          </SettingRow>
        );
      })}
    </>
  );
}
