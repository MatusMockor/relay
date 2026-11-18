import type { AccountId, Address, MessageId, ThreadId } from '@relay/shared';
import { create } from 'zustand';
import type { AnchorRect } from '@relay/ui';
import { type AccountScope, type Folder, INBOX } from './folders';

export type RightTab = 'contact' | 'ai' | 'calendar';
export type SettingsSection =
  | 'server'
  | 'account'
  | 'devices'
  | 'accounts'
  | 'splits'
  | 'automations'
  | 'jira'
  | 'sync'
  | 'notifications'
  | 'ai'
  | 'look'
  | 'keys'
  | 'calendars';

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

export type OverlayState =
  | { readonly kind: 'palette' }
  | { readonly kind: 'shortcuts' }
  | { readonly kind: 'settings'; readonly section: SettingsSection; readonly adding: boolean }
  | { readonly kind: 'compose'; readonly init: ComposeInit }
  | { readonly kind: 'remind'; readonly threadId: ThreadId; readonly anchor: AnchorRect }
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
  readonly leftUser: boolean | null;
  readonly rightOpen: boolean;
  readonly rightTab: RightTab;
  readonly widths: { readonly sidebar: number; readonly rightPanel: number };
  readonly overlay: OverlayState | null;
  readonly reply: ReplyState | null;
  readonly expanded: Readonly<Record<string, boolean>>;
  readonly calendarDay: number;
}

export const INITIAL_UI: UiState = {
  scope: 'all',
  folder: INBOX,
  openThreadId: null,
  selected: {},
  searchOpen: false,
  query: '',
  leftUser: null,
  rightOpen: true,
  rightTab: 'contact',
  widths: { sidebar: 214, rightPanel: 300 },
  overlay: null,
  reply: null,
  expanded: {},
  calendarDay: 0,
};

export const useUiStore = create<UiState>(() => INITIAL_UI);

export const setUi = (patch: Partial<UiState> | ((state: UiState) => Partial<UiState>)): void => {
  useUiStore.setState(patch);
};
