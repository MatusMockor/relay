import type {
  AiRunnerInfo,
  AppInfo,
  DeviceRegistration,
  DeviceSettings,
  DeviceSettingsPatch,
  GoogleAuthorizeInput,
  GoogleAuthorizeOutput,
  GoogleCalendarAuthorizeInput,
  GoogleCalendarAuthorizeOutput,
  MenuCommand,
  NotificationRequest,
  RelayBridge,
  ThreadId,
  TrayReport,
  UpdateStatus,
} from '@relay/shared';
import type { FetchLike } from '../data/remote/HttpApi';
import type { SessionHooks, SessionTokens } from '../data/remote/SessionTokens';

export interface ServerSessionHooks extends SessionHooks {
  readonly fetch?: FetchLike;
}

export type PlatformKind = 'electron' | 'browser';

export interface Platform {
  readonly kind: PlatformKind;
  readonly bridge: RelayBridge | null;
  appInfo(): Promise<AppInfo>;
  deviceSettings(): Promise<DeviceSettings>;
  updateDeviceSettings(patch: DeviceSettingsPatch): Promise<DeviceSettings>;
  serverSession(serverUrl: string, hooks: ServerSessionHooks): SessionTokens;
  detectLocalRunners(): Promise<AiRunnerInfo[]>;
  openExternal(url: string): void;
  saveFile(blob: Blob, filename: string): void;
  authorizeGoogle(input: GoogleAuthorizeInput): Promise<GoogleAuthorizeOutput>;
  cancelGoogleAuthorization(): Promise<void>;
  authorizeGoogleCalendar(
    input: GoogleCalendarAuthorizeInput,
  ): Promise<GoogleCalendarAuthorizeOutput>;
  subscribeToUpdates(listener: (status: UpdateStatus) => void): () => void;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  subscribeToThreadOpens(listener: (threadId: ThreadId) => void): () => void;
  subscribeToMenuCommands(listener: (command: MenuCommand) => void): () => void;
  reportTray(report: TrayReport): void;
  showNotification(notification: NotificationRequest): Promise<void>;
  subscribeToFullScreen(listener: (fullScreen: boolean) => void): () => void;
}

const PLATFORM_LABEL: Readonly<Record<AppInfo['platform'], string>> = {
  macos: 'macOS',
  linux: 'Linux',
  windows: 'Windows',
};

export const deviceRegistrationOf = (info: AppInfo, kind: PlatformKind): DeviceRegistration => ({
  name:
    kind === 'electron'
      ? `Relay na ${PLATFORM_LABEL[info.platform]}`
      : `Prehliadač (${PLATFORM_LABEL[info.platform]})`,
  platform: info.platform,
});
