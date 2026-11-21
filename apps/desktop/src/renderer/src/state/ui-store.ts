import type { AccountId, Address, MessageId, SettingsSection, ThreadId } from '@relay/shared';
import { create } from 'zustand';
import type { AnchorRect } from '@relay/ui';
import { type AccountScope, type Folder, INBOX } from './folders';
import type { SearchFilters } from './search-filters';

export type RightTab = 'contact' | 'ai' | 'calendar';
export type { SettingsSection };

export interface ComposeInit {
  readonly draftId?: string;
  readonly toEmail?: string;
  readonly toName?: string | null;
  readonly to?: readonly Address[];
  readonly cc?: readonly Address[];
  readonly bcc?: readonly Address[];
  readonly subject?: string;
  readonly body?: string;
  readonly accountId?: AccountId;
  readonly inReplyToThreadId?: ThreadId;
  readonly inReplyToMessageId?: MessageId;
  readonly forward?: { readonly messageId: MessageId; readonly attachmentCount: number };
}

export type AutomationView =
  | { readonly kind: 'list' }
  | { readonly kind: 'templates' }
  | { readonly kind: 'detail'; readonly key: string };

export interface SettingsOverlay {
  readonly kind: 'settings';
  readonly section: SettingsSection;
  readonly adding: boolean;
  readonly automation?: AutomationView;
  readonly split?: string;
}

export type OverlayState =
  | { readonly kind: 'palette' }
  | { readonly kind: 'search' }
  | { readonly kind: 'shortcuts' }
  | SettingsOverlay
  | { readonly kind: 'compose'; readonly init: ComposeInit; readonly scope: AccountScope }
  | { readonly kind: 'remind'; readonly threadId: ThreadId; readonly anchor: AnchorRect }
  | { readonly kind: 'move'; readonly threadId: ThreadId }
  | { readonly kind: 'labels'; readonly threadId: ThreadId }
  | { readonly kind: 'ruleFromMail'; readonly threadId: ThreadId }
  | { readonly kind: 'accounts'; readonly anchor: AnchorRect };

export interface ReplyState {
  readonly threadId: ThreadId;
  readonly text: string;
  readonly accountId: AccountId;
  readonly draftId: string | null;
  readonly aiOpen: boolean;
  readonly busy: boolean;
}

export interface UiState {
  readonly scope: AccountScope;
  readonly folder: Folder;
  readonly openThreadId: ThreadId | null;
  readonly selected: Readonly<Record<string, string>>;
  readonly searchOpen: boolean;
  readonly query: string;
  readonly searchFilters: SearchFilters | null;
  readonly leftUser: boolean | null;
  readonly rightOpen: boolean;
  readonly rightTab: RightTab;
  readonly widths: { readonly sidebar: number; readonly rightPanel: number };
  readonly overlay: OverlayState | null;
  readonly reply: ReplyState | null;
  readonly expanded: Readonly<Record<string, boolean>>;
  readonly collapsed: Readonly<Record<string, boolean>>;
  readonly calendarDay: number;
}

export const INITIAL_UI: UiState = {
  scope: 'all',
  folder: INBOX,
  openThreadId: null,
  selected: {},
  searchOpen: false,
  query: '',
  searchFilters: null,
  leftUser: null,
  rightOpen: true,
  rightTab: 'contact',
  widths: { sidebar: 214, rightPanel: 300 },
  overlay: null,
  reply: null,
  expanded: {},
  collapsed: {},
  calendarDay: 0,
};

export const useUiStore = create<UiState>(() => INITIAL_UI);

export const toggleCollapsed = (key: string): void => {
  useUiStore.setState((state) => {
    const { [key]: wasCollapsed = false, ...rest } = state.collapsed;
    return { collapsed: wasCollapsed ? rest : { ...rest, [key]: true } };
  });
};

export const expandCollapsed = (key: string): void => {
  if (useUiStore.getState().collapsed[key] !== true) {
    return;
  }
  toggleCollapsed(key);
};

export const setUi = (patch: Partial<UiState> | ((state: UiState) => Partial<UiState>)): void => {
  useUiStore.setState(patch);
};
