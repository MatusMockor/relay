import { join } from 'node:path';

export interface LocalPaths {
  readonly userData: string;
  readonly database: string;
  readonly migrations: string;
  readonly secrets: string;
  readonly deviceSettings: string;
  readonly windowState: string;
  readonly googleClient: string;
  readonly attachments: string;
  readonly logFile: string;
}

export const resolveLocalPaths = (userData: string, migrations: string): LocalPaths => ({
  userData,
  database: join(userData, 'relay.db'),
  migrations,
  secrets: join(userData, 'secrets.bin'),
  deviceSettings: join(userData, 'device-settings.json'),
  windowState: join(userData, 'window-state.json'),
  googleClient: join(userData, 'google-oauth.json'),
  attachments: join(userData, 'attachments'),
  logFile: join(userData, 'logs', 'main.log'),
});
