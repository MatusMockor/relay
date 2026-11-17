import type { AiFeatures, AiRunnerInfo, AiRunnerKind, AiRunnerLocation } from '@relay/shared';
import { Segmented, Status, Switch } from '@relay/ui';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../data/hooks/query-keys';
import { useAppContext, useServices } from '../../../data/hooks/services-context';
import { useAiRunners, useUserSettings } from '../../../data/hooks/use-mail-queries';
import { SettingRow } from '../SettingRow';
import { useUpdateSettings } from '../use-update-settings';
import { SectionHeader } from '../SectionHeader';

const RUNNER_LABEL: Readonly<Record<AiRunnerKind, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
};
const FEATURES: readonly (readonly [keyof AiFeatures, string, string])[] = [
  ['oneLiners', 'Jednoriadkové zhrnutia', 'Zhrnutie pri každom maile v zozname'],
  ['summaries', 'Zhrnutia vlákien', 'Zhrnutie a checklist nad vláknom'],
  ['replySuggestions', 'Návrhy odpovedí', 'Navrhnuté odpovede pod mailom'],
  ['jiraTriage', 'Jira triáž', 'Notifikácie z Jiry triedi do Úloh a splitu Jira'],
];

const runnerStatus = (info: AiRunnerInfo | undefined) => {
  if (info === undefined || !info.installed) {
    return <Status tone="off" label="Nenainštalované" />;
  }
  if (info.authenticated === false) {
    return <Status tone="bad" label="Neprihlásené" />;
  }
  return (
    <Status
      tone="ok"
      label={info.version === null ? 'Pripravené' : `Pripravené · ${info.version}`}
    />
  );
};

function RunnerRows({
  title,
  runners,
}: {
  readonly title: string;
  readonly runners: readonly AiRunnerInfo[];
}) {
  return (
    <>
      <h4 className="acc-g">{title}</h4>
      {(['claude', 'codex'] as const).map((kind) => {
        const info = runners.find((runner) => runner.runner === kind);
        return (
          <SettingRow
            key={kind}
            title={RUNNER_LABEL[kind]}
            description={info?.executablePath ?? (kind === 'claude' ? 'claude CLI' : 'codex CLI')}
          >
            {runnerStatus(info)}
          </SettingRow>
        );
      })}
    </>
  );
}

export function AiSection() {
  const services = useServices();
  const { platform } = useAppContext();
  const settings = useUserSettings();
  const update = useUpdateSettings();
  const remote = useAiRunners();
  const local = useQuery({
    queryKey: queryKeys.localRunners(),
    queryFn: () => platform.detectLocalRunners(),
    enabled: services.mode === 'synced' && platform.kind === 'electron',
  });
  const ai = settings.data?.ai;
  const synced = services.mode === 'synced';
  const location: AiRunnerLocation = synced ? (ai?.location ?? 'server') : 'local';
  const canRunLocal = platform.kind === 'electron';
  const localDescription = canRunLocal
    ? 'Na tomto počítači cez lokálne CLI'
    : 'Na počítači s aplikáciou Relay. V prehliadači lokálne AI nebeží.';
  return (
    <>
      <SectionHeader title="AI" stored>
        AI spúšťa Claude Code alebo Codex CLI na tvojom predplatnom. Obsah mailov je nedôveryhodný
        vstup a odoslanie vždy potvrdzuješ ty.
      </SectionHeader>
      <SettingRow
        title="Kde beží AI"
        scope="synced"
        description={
          location === 'server' ? 'Na serveri, aj keď je tento počítač vypnutý' : localDescription
        }
      >
        {synced ? (
          <Segmented<AiRunnerLocation>
            label="Kde beží AI"
            value={location}
            options={[
              { value: 'server', label: 'Server' },
              ...(canRunLocal || location === 'local'
                ? [{ value: 'local' as const, label: 'Lokálne' }]
                : []),
            ]}
            onChange={(value) => {
              update.mutate({ ai: { location: value } });
            }}
          />
        ) : (
          <Status tone="ok" label="Lokálne" />
        )}
      </SettingRow>
      <SettingRow
        title="Predvolený runner"
        scope="synced"
        description="Dá sa prepnúť aj priamo v paneli AI"
      >
        <Segmented<AiRunnerKind>
          label="Predvolený runner"
          value={ai?.defaultRunner ?? 'claude'}
          options={[
            { value: 'claude', label: 'Claude Code' },
            { value: 'codex', label: 'Codex' },
          ]}
          onChange={(value) => {
            update.mutate({ ai: { defaultRunner: value } });
          }}
        />
      </SettingRow>
      <RunnerRows title={synced ? 'Na serveri' : 'Na tomto počítači'} runners={remote.data ?? []} />
      {synced && platform.kind === 'electron' ? (
        <RunnerRows title="Na tomto počítači" runners={local.data ?? []} />
      ) : null}
      <h4 className="acc-g">Funkcie</h4>
      {FEATURES.map(([key, title, description]) => (
        <SettingRow key={key} title={title} description={description} scope="synced">
          <Switch
            checked={ai?.features[key] ?? true}
            label={title}
            onChange={(next) => {
              update.mutate({ ai: { features: { [key]: next } } });
            }}
          />
        </SettingRow>
      ))}
    </>
  );
}
