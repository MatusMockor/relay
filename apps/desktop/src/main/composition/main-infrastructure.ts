import type { Clock, IdGenerator, Logger } from '@relay/engine';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { EventHub } from '../events/event-hub';
import { HubEventPublisher } from '../events/hub-event-publisher';
import { RandomIdGenerator } from '../infra/random-id-generator';
import type { SecretCipher } from '../platform/secret-cipher';
import { EncryptedFileSecretStore } from '../secure/encrypted-file-secret-store';
import { NamespacedSecretStore } from '../secure/namespaced-secret-store';
import type { SecretStore } from '../secure/secret-store';
import { SecretStoreCalendarFeedSecrets } from '../secure/secret-store-calendar-feed-secrets';
import { SecretStoreCredentialVault } from '../secure/secret-store-credential-vault';
import { SecretStoreGoogleCalendarCredentials } from '../secure/secret-store-google-calendar-credentials';
import { SecretStoreTaskSystemSecrets } from '../secure/secret-store-task-system-secrets';
import { DeviceSettingsStore } from '../settings/device-settings-store';
import type { LocalPaths } from './local-paths';

export interface MainInfrastructureInput {
  readonly paths: LocalPaths;
  readonly cipher: SecretCipher;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface MainInfrastructure {
  readonly paths: LocalPaths;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly ids: IdGenerator;
  readonly hub: EventHub<RealtimeEvent>;
  readonly publisher: HubEventPublisher;
  readonly rendererSecrets: SecretStore;
  readonly vault: SecretStoreCredentialVault;
  readonly calendarFeeds: SecretStoreCalendarFeedSecrets;
  readonly googleCalendarCredentials: SecretStoreGoogleCalendarCredentials;
  readonly taskSystemSecrets: SecretStoreTaskSystemSecrets;
  readonly deviceSettings: DeviceSettingsStore;
}

export const createMainInfrastructure = (input: MainInfrastructureInput): MainInfrastructure => {
  const hub = new EventHub<RealtimeEvent>();
  const secrets = new EncryptedFileSecretStore(input.paths.secrets, input.cipher);
  return {
    paths: input.paths,
    clock: input.clock,
    logger: input.logger,
    ids: new RandomIdGenerator(),
    hub,
    publisher: new HubEventPublisher(hub),
    rendererSecrets: new NamespacedSecretStore(secrets, 'renderer'),
    vault: new SecretStoreCredentialVault(new NamespacedSecretStore(secrets, 'credentials')),
    calendarFeeds: new SecretStoreCalendarFeedSecrets(
      new NamespacedSecretStore(secrets, 'calendar-feeds'),
    ),
    googleCalendarCredentials: new SecretStoreGoogleCalendarCredentials(
      new NamespacedSecretStore(secrets, 'google-calendar'),
    ),
    taskSystemSecrets: new SecretStoreTaskSystemSecrets(
      new NamespacedSecretStore(secrets, 'task-systems'),
    ),
    deviceSettings: new DeviceSettingsStore(input.paths.deviceSettings),
  };
};
