import { z } from 'zod';
import packageJson from '../../package.json' with { type: 'json' };

export const APP_INFO = Symbol.for('relay.server.AppInfo');

export interface AppInfo {
  readonly version: string;
}

const PackageJsonSchema = z.object({ version: z.string().min(1) });

export const readAppInfo = (): AppInfo => ({
  version: PackageJsonSchema.parse(packageJson).version,
});
