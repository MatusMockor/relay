import { RELAY_REPOSITORY_URL } from '@relay/shared/domain';
import type { AboutPanelOptionsOptions } from 'electron';

export const RELAY_COPYRIGHT = 'Copyright © 2026 Relay';

export const aboutPanelOptions = (name: string, version: string): AboutPanelOptionsOptions => ({
  applicationName: name,
  applicationVersion: version,
  copyright: RELAY_COPYRIGHT,
  website: RELAY_REPOSITORY_URL,
});
