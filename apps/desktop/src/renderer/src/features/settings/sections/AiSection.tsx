import type { AiFeatures, AiRunnerLocation } from '@relay/shared';
import { Segmented, Status, Switch } from '@relay/ui';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../data/hooks/query-keys';
import { useAppContext, useServices } from '../../../data/hooks/services-context';
import { useAiRunners, useUserSettings } from '../../../data/hooks/use-mail-queries';
import { SettingRow } from '../SettingRow';
import { SettingsGroup } from '../SettingsGroup';
import { useUpdateSettings } from '../use-update-settings';
import { SectionHeader } from '../SectionHeader';
import { ModelRows } from './ai/ModelRows';
import { RunnerRows } from './ai/RunnerRows';

const FEATURES: readonly (readonly [keyof AiFeatures, string, string])[] = [
  ['oneLiners', 'Jednoriadkové zhrnutia', 'Zhrnutie pri každom maile v zozname'],
  ['summaries', 'Zhrnutia vlákien', 'Zhrnutie a checklist nad vláknom'],
  ['replySuggestions', 'Návrhy odpovedí', 'Navrhnuté odpovede pod mailom'],
  ['jiraTriage', 'Jira triáž', 'Notifikácie z Jiry triedi do Úloh a splitu Jira'],
];

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
      <SectionHeader title="AI">
        AI spúšťa Claude Code alebo Codex CLI na tvojom predplatnom. Obsah mailov je nedôveryhodný
        vstup a odoslanie vždy potvrdzuješ ty.
      </SectionHeader>
      <SettingRow
        title="Kde beží AI"
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
      <ModelRows
        ai={ai}
        runners={synced && location === 'local' ? local.data : remote.data}
        onChange={(key, choice) => {
          update.mutate({ ai: { [key]: choice } });
        }}
      />
      <RunnerRows
        title={synced ? 'Na serveri' : 'Na tomto počítači'}
        where={synced ? 'server' : 'local'}
        runners={remote.data ?? []}
      />
      {synced && platform.kind === 'electron' ? (
        <RunnerRows title="Na tomto počítači" where="local" runners={local.data ?? []} />
      ) : null}
      <SettingsGroup title="Funkcie" />
      {FEATURES.map(([key, title, description]) => (
        <SettingRow key={key} title={title} description={description}>
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
