import { DEFAULT_JIRA_TASK_EVENTS, type JiraEventKind } from '@relay/shared';
import { Switch } from '@relay/ui';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { SectionHeader } from '../SectionHeader';
import { SettingRow } from '../SettingRow';
import { SettingsGroup } from '../SettingsGroup';
import { useUpdateSettings } from '../use-update-settings';

const EVENTS: readonly (readonly [JiraEventKind, string, string])[] = [
  ['mention', 'Zmienka', 'Niekto ťa spomenul v komentári alebo popise'],
  ['assigned', 'Priradenie', 'Úlohu priradili tebe'],
  ['comment', 'Komentár', 'Nový komentár k úlohe'],
  ['status', 'Zmena stavu', 'Úloha sa presunula do iného stavu'],
  ['other', 'Ostatné zmeny', 'Napríklad sprint alebo iné polia'],
];

export function JiraSection() {
  const settings = useUserSettings();
  const update = useUpdateSettings();
  const selected = settings.data?.jira.taskEvents ?? DEFAULT_JIRA_TASK_EVENTS;
  const locked = settings.data === undefined || update.isPending;
  const toggle = (kind: JiraEventKind, on: boolean) => {
    const taskEvents = EVENTS.map(([key]) => key).filter((key) =>
      key === kind ? on : selected.includes(key),
    );
    update.mutate({ jira: { taskEvents } });
  };
  return (
    <>
      <SectionHeader title="Jira">
        Notifikácie z Jiry ostávajú vo svojom splite. Tu vyberieš, ktoré z nich pridajú vlákno aj do
        Úloh. Zmena platí len pre nové notifikácie, existujúce úlohy ostanú, ako sú.
      </SectionHeader>
      <SettingsGroup title="Čo pridať do Úloh" />
      {EVENTS.map(([kind, title, description]) => (
        <SettingRow key={kind} title={title} description={description}>
          <Switch
            checked={selected.includes(kind)}
            label={title}
            disabled={locked}
            onChange={(next) => {
              toggle(kind, next);
            }}
          />
        </SettingRow>
      ))}
    </>
  );
}
