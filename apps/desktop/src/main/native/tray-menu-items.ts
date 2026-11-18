import type { AccountScope, SettingsSection } from '@relay/shared/ipc';
import type { PauseDuration } from './pause-end';

export type TrayAction =
  | { readonly type: 'show-window' }
  | { readonly type: 'compose' }
  | { readonly type: 'select-scope'; readonly scope: AccountScope }
  | { readonly type: 'sync-now' }
  | { readonly type: 'pause-notifications'; readonly duration: PauseDuration }
  | { readonly type: 'resume-notifications' }
  | { readonly type: 'open-settings'; readonly section: SettingsSection }
  | { readonly type: 'check-updates' }
  | { readonly type: 'open-about' }
  | { readonly type: 'quit' };

export type TrayTone = 'ok' | 'busy' | 'failed' | 'idle';

export type TrayMenuItem =
  | { readonly kind: 'separator' }
  | { readonly kind: 'status'; readonly label: string; readonly tone: TrayTone }
  | { readonly kind: 'header'; readonly label: string }
  | { readonly kind: 'note'; readonly label: string }
  | {
      readonly kind: 'action';
      readonly label: string;
      readonly action: TrayAction;
      readonly accelerator?: string;
    }
  | {
      readonly kind: 'choice';
      readonly label: string;
      readonly sublabel: string | null;
      readonly color: string | null;
      readonly checked: boolean;
      readonly action: TrayAction;
    }
  | { readonly kind: 'submenu'; readonly label: string; readonly items: readonly TrayMenuItem[] };
