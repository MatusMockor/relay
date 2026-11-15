import { join, resolve } from 'node:path';

export interface MigrationsLocation {
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly appPath: string;
}

export const resolveMigrationsFolder = (location: MigrationsLocation): string => {
  if (location.isPackaged) {
    return join(location.resourcesPath, 'drizzle');
  }
  return resolve(location.appPath, '../../packages/store-sqlite/drizzle');
};
