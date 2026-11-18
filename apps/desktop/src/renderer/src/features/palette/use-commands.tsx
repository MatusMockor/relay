import { composeOverlay } from '../../state/compose-overlay';
import { FolderIcon, Icon, Spark } from '@relay/ui';
import type { ThreadState } from '@relay/shared';
import type { ReactNode } from 'react';
import { useSplits } from '../../data/hooks/use-mail-queries';
import { ALT, MOD } from '../../lib/platform-keys';
import { NAV_VIEWS, VIEW_META } from '../../state/folders';
import { setUi, useUiStore } from '../../state/ui-store';
import { centerRect } from '../folders/rect';
import { useMailActions } from '../mail/MailActionsProvider';
import { openRight, openSearch, selectFolder, toggleRight } from '../mail/navigation';
import { useAccountsModel } from '../mail/use-accounts-model';
import { splitGKey, splitsInScope } from '../shell/SplitTabs';
import { useLayout } from '../shell/use-layout';
import { threadComposeCommands } from './thread-compose-commands';
import { threadSpamCommand } from './thread-spam-command';
import { scopeCommands } from './scope-commands';

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly sub?: string;
  readonly keys: readonly string[];
  readonly icon: ReactNode;
  readonly alias: string;
  readonly run: () => void;
}

const ICONS = {
  inbox: 'inbox',
  task: 'task',
  clock: 'clock',
  check: 'check',
  send: 'send',
  file: 'file',
  calendar: 'calendar',
  spam: 'spam',
  trash: 'trash',
  folder: 'folder',
  label: 'label',
} as const;

const gKeys = (key: string | null): string[] => (key === null ? [] : ['G', key]);

const RESTORING_STATES: readonly ThreadState[] = ['done', 'trash', 'spam'];

export const useCommands = (): Command[] => {
  const actions = useMailActions();
  const model = useAccountsModel();
  const scope = useUiStore((state) => state.scope);
  const rightOpen = useUiStore((state) => state.rightOpen);
  const splits = splitsInScope(useSplits().data ?? [], scope);
  const layout = useLayout();
  const current = actions.current;
  const ctx = current?.kind === 'thread' ? current.thread.subject.slice(0, 38) : undefined;
  const thread = current?.kind === 'thread' ? current.thread : null;
  const restoring = thread !== null && RESTORING_STATES.includes(thread.state);
  const settings =
    (section: 'accounts' | 'server' | 'look' | 'keys' = 'accounts', adding = false) =>
    () => {
      setUi({ overlay: { kind: 'settings', section, adding } });
    };
  const contextual: Command[] =
    current === null
      ? []
      : [
          {
            id: 'done',
            label: restoring ? 'Vrátiť do Doručenej pošty' : 'Hotovo',
            sub: ctx,
            keys: ['E'],
            icon: <Icon name={restoring ? 'inbox' : 'check'} />,
            alias: 'done archivovat vybavene obnovit',
            run: () => {
              actions.thread.markDone(current);
            },
          },
          ...(thread === null
            ? []
            : [
                {
                  id: 'remind',
                  label: 'Pripomenúť',
                  sub: ctx,
                  keys: ['H'],
                  icon: <Icon name="clock" />,
                  alias: 'snooze odlozit neskor',
                  run: () => {
                    setUi({
                      overlay: { kind: 'remind', threadId: thread.id, anchor: centerRect() },
                    });
                  },
                },
                {
                  id: 'reply',
                  label: 'Odpovedať',
                  sub: ctx,
                  keys: ['R'],
                  icon: <Icon name="reply" />,
                  alias: 'reply napisat',
                  run: () => {
                    actions.compose.startReply(thread.id, thread.accountId);
                  },
                },
                ...threadComposeCommands(thread.id, ctx, actions.compose),
                ...threadSpamCommand(thread, ctx, actions.thread),
              ]),
          {
            id: 'trash',
            label: 'Do koša',
            sub: ctx,
            keys: ['#'],
            icon: <Icon name="trash" />,
            alias: 'delete zmazat kos vymazat',
            run: () => {
              actions.thread.trash(current);
            },
          },
        ];
  return [
    {
      id: 'compose',
      label: 'Napísať novú správu',
      keys: ['C'],
      icon: <Icon name="pen" />,
      alias: 'compose nova sprava mail napisat',
      run: () => {
        setUi({ overlay: composeOverlay({}) });
      },
    },
    ...contextual,
    {
      id: 'ask',
      label: 'Spýtať sa AI',
      keys: ['A'],
      icon: <Spark />,
      alias: 'ai claude codex agent otazka chat panel',
      run: () => {
        openRight('ai');
      },
    },
    ...scopeCommands(model),
    {
      id: 'add-account',
      label: 'Pridať účet',
      keys: [],
      icon: <Icon name="plus" />,
      alias: 'pridat ucet imap gmail pripojit novy',
      run: settings('accounts', true),
    },
    {
      id: 'accounts',
      label: 'Spravovať účty',
      keys: [],
      icon: <Icon name="user" />,
      alias: 'ucty nastavenia odpojit hlavny ucet interval',
      run: settings('accounts'),
    },
    {
      id: 'go-main',
      label: 'Prejsť na Dôležité',
      keys: ['G', 'I'],
      icon: <Icon name="inbox" />,
      alias: 'inbox dorucena posta split',
      run: () => {
        selectFolder({ kind: 'inbox', splitId: null });
      },
    },
    ...splits.map((split) => ({
      id: `split-${split.id}`,
      label: `Prejsť na ${split.name}`,
      keys: gKeys(splitGKey(split)),
      icon: <Icon name="inbox" />,
      alias: 'split inbox',
      run: () => {
        selectFolder({ kind: 'inbox', splitId: split.id });
      },
    })),
    ...NAV_VIEWS.filter((view) => view !== 'inbox').map((view) => ({
      id: `view-${view}`,
      label: VIEW_META[view].label,
      keys: ['G', VIEW_META[view].g],
      icon: <FolderIcon name={ICONS[VIEW_META[view].icon]} />,
      alias: `priecinok ${view}`,
      run: () => {
        selectFolder({ kind: 'view', view });
      },
    })),
    {
      id: 'left',
      label: layout.leftVisible ? 'Skryť priečinky' : 'Zobraziť priečinky',
      keys: ['['],
      icon: <Icon name="panelLeft" />,
      alias: 'lavy panel sidebar priecinky',
      run: () => {
        setUi({ leftUser: !layout.leftVisible });
      },
    },
    {
      id: 'right',
      label: rightOpen ? 'Skryť pravý panel' : 'Zobraziť pravý panel',
      keys: ['I'],
      icon: <Icon name="panelRight" />,
      alias: 'pravy panel sidebar',
      run: toggleRight,
    },
    {
      id: 'tab-contact',
      label: 'Pravý panel: Kontakt',
      keys: [`${ALT}1`],
      icon: <Icon name="user" />,
      alias: 'zalozka kontakt',
      run: () => {
        openRight('contact');
      },
    },
    {
      id: 'tab-ai',
      label: 'Pravý panel: AI',
      keys: [`${ALT}2`],
      icon: <Spark />,
      alias: 'zalozka ai',
      run: () => {
        openRight('ai');
      },
    },
    {
      id: 'tab-calendar',
      label: 'Pravý panel: Kalendár',
      keys: [`${ALT}3`],
      icon: <Icon name="calendar" />,
      alias: 'zalozka kalendar',
      run: () => {
        openRight('calendar');
      },
    },
    {
      id: 'search',
      label: 'Hľadať v zozname',
      keys: ['/'],
      icon: <Icon name="search" />,
      alias: 'search filter',
      run: openSearch,
    },
    {
      id: 'reset-widths',
      label: 'Obnoviť šírky panelov',
      keys: [],
      icon: <Icon name="panelLeft" />,
      alias: 'sirka panel resize predvolene',
      run: () => {
        setUi({ widths: { sidebar: 214, rightPanel: 300 } });
      },
    },
    {
      id: 'look',
      label: 'Vzhľad a hustota zoznamu',
      keys: [],
      icon: <Icon name="keyboard" />,
      alias: 'hustota density vzhlad',
      run: settings('look'),
    },
    {
      id: 'settings',
      label: 'Nastavenia',
      keys: [`${MOD},`],
      icon: <Icon name="gear" />,
      alias: 'settings server ucet ai',
      run: settings('accounts'),
    },
    {
      id: 'shortcuts',
      label: 'Klávesové skratky',
      keys: ['?'],
      icon: <Icon name="keyboard" />,
      alias: 'shortcuts klavesy pomoc help',
      run: () => {
        setUi({ overlay: { kind: 'shortcuts' } });
      },
    },
  ];
};
